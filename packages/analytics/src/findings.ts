import type { Dataset, Finding, Severity } from './types';
import { detectFields, numeric, profileData } from './profile';
import { interpretConcentration } from './concentration';
import { interpretSegments } from './segments';
import { iqrBounds, pearson, round, sum, quantile, welchTest, tCdf, fmtP } from './stats';
import { money, pctStr, plural } from './money';
import { explainChange, scanAnomalies, storeFindings } from './insights';
import { comparisonWindows, inWin, toMs, DAY, pickWindowDays } from './time';

const W: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const GEO = /country|region|state|province|city|market/i;
const ID_LIKE = /^(order|invoice|transaction)/i;
const UNKNOWN_BUYER = new Set(['Unknown customer', 'Guest checkout', 'Unknown', '']);

function mk(f: Omit<Finding, 'score'>): Finding {
  return { ...f, score: round(W[f.severity] * 10 * f.confidence + Math.log10(1 + (f.impactUsd ?? 0)), 2) };
}

// Results are cached per rows array (+ currency), so every page and tool call after the first is instant.
const cache = new WeakMap<object, Map<string, Finding[]>>();

export function analyzeSmart(ds: Dataset): Finding[] {
  const key = ds.currency ?? 'USD';
  const hit = cache.get(ds.rows)?.get(key);
  if (hit) return hit;
  const res = analyzeUncached(ds);
  const m = cache.get(ds.rows) ?? new Map<string, Finding[]>();
  m.set(key, res); cache.set(ds.rows, m);
  return res;
}

function analyzeUncached(ds: Dataset): Finding[] {
  const fm = detectFields(ds);
  const rows = ds.rows;
  const out: Finding[] = [];
  if (!rows.length || !fm.measure) return out;
  const $ = (n: number) => money(n, ds.currency);
  const pct = (n: number) => pctStr(n);
  const transactional = 'Order' in rows[0] && 'IsReturn' in rows[0];
  const sales = transactional ? rows.filter((r) => r.IsReturn !== 1) : rows;
  const total = sum(numeric(sales, fm.measure));

  // 1. Concentration. Customers and products are dependency risks; geography is framed as market reach.
  for (const dim of fm.highCardDims.filter((d) => !ID_LIKE.test(d))) {
    // Concentration is measured over KNOWN buyers/products only, the same base the dashboard counts.
    const c = interpretConcentration(sales.filter((r) => !UNKNOWN_BUYER.has(String(r[dim] ?? ''))), dim, fm.measure);
    if (c.risk === 'low') continue;
    const top = c.groups.slice(0, 3), geo = GEO.test(dim);
    out.push(mk({
      id: `conc-${dim}`, category: 'concentration',
      title: geo ? `${pct(c.top1Share)} of ${fm.measure} comes from one ${dim.toLowerCase()} (${top[0]?.key})` : `${pct(c.top5Share)} of ${fm.measure} comes from your top 5 ${plural(dim)}`,
      severity: geo ? 'low' : c.risk === 'high' ? 'high' : 'medium',
      confidence: 1, basis: 'measured', pValue: null, period: 'whole file', exposure: geo ? null : 'at-risk',
      metric: `${dim} concentration (top-5 share)`,
      explanation: geo
        ? `Most sales come from ${top[0]?.key}. That is normal for a home market, but it means growth depends on one economy; ${c.groupCount - 1} other ${plural(dim)} share the rest.`
        : `${c.groupsFor80Pct} of ${c.groupCount} ${plural(dim)} generate 80% of ${fm.measure}. Top: ${top.map((g) => `${g.key} (${pct(g.share)})`).join(', ')}. Losing one of these would cut sales by its share.`,
      evidence: { top5Share: c.top5Share, top1Share: c.top1Share, hhi: c.hhi, groupsFor80Pct: c.groupsFor80Pct, topGroups: top },
      impactUsd: geo ? null : round(c.groups.slice(0, 3).reduce((s, g) => s + g.value, 0)),
      impactBasis: geo ? null : `Sales from just your top 3 ${plural(dim)} (out of ${c.groupCount.toLocaleString()}, and ${$(c.total)} total): what you'd lose if they left`,
      nextAction: geo ? `Test one or two new markets where you already have some buyers.` : `Set a diversification target and give the top ${plural(dim)} a named owner and retention plan.`,
    }));
  }

  // 2. Loss-making segments
  for (const dim of fm.dims) {
    const s = interpretSegments(rows, dim, fm.measure, { profit: fm.profit });
    for (const seg of s.segments) {
      if (seg.profit !== undefined && seg.margin !== undefined && seg.margin < 0 && seg.orders >= 10) {
        out.push(mk({
          id: `loss-${dim}-${seg.key}`, category: 'profitability',
          title: `${seg.key} loses money: ${$(Math.abs(seg.profit))} net loss`,
          severity: seg.margin < -0.05 ? 'critical' : 'high',
          confidence: 1, basis: 'measured', pValue: null, period: 'whole file', exposure: 'lost',
          metric: `${dim} = ${seg.key} margin`,
          explanation: `${seg.key} produced ${$(seg.value)} in ${fm.measure} at a ${pct(seg.margin)} margin across ${seg.orders} orders, so every sale loses money.`,
          evidence: { dimension: dim, segment: seg.key, margin: seg.margin, profit: seg.profit, sales: seg.value, orders: seg.orders },
          impactUsd: round(Math.abs(seg.profit)), impactBasis: 'Cumulative loss in the loaded period',
          nextAction: `Review pricing and discounting on ${seg.key}; cap discounts or reprice before the next quarter.`,
        }));
      }
    }
  }

  // 3. Layer 2: is the business shrinking, and what is driving it?
  if (fm.date) {
    const days = pickWindowDays(sales, fm.date);
    const w = comparisonWindows(sales, fm.date, days);
    const drv = w ? explainChange(rows, fm, { windows: w }) : null;
    if (drv && w && drv.changePct <= -0.05) {
      const wk = (win: [number, number]) => { const n = Math.round(days / 7), b = new Array(n).fill(0); for (const r of sales) { const t = toMs(r[fm.date!]); if (inWin(t, win)) b[Math.min(n - 1, Math.floor((t - win[0]) / (7 * DAY)))] += (r[fm.measure] as number) || 0; } return b; };
      const test = welchTest(wk(w.current), wk(w.baseline)), t = round(test.stat, 2);
      if (test.pLess < 0.05) {
        const drag = drv.byDimension.map((d) => ({ dim: d.dimension, top: d.drags[0] })).filter((x) => x.top && !ID_LIKE.test(x.dim)).sort((a, b) => b.top.shareOfChange - a.top.shareOfChange)[0];
        out.push(mk({
          id: 'driver-decline', category: 'trend',
          title: `${fm.measure} down ${pct(Math.abs(drv.changePct))} (${w.mode === 'year-over-year' ? 'vs same period last year' : 'vs previous period'})${drag ? `, led by ${drag.dim} ${drag.top.segment}` : ''}`,
          severity: drv.changePct <= -0.15 ? 'high' : 'medium', confidence: round(Math.min(0.999, Math.max(0.5, 1 - test.pLess)), 3), basis: 'tested', pValue: round(test.pLess, 4), period: w.label.split(' vs ')[0], exposure: 'lost',
          metric: `${fm.measure}, ${w.label}`,
          explanation: `${fm.measure} went from ${$(drv.baseline)} to ${$(drv.current)} (Welch t-test on weekly sales, ${fmtP(test.pLess)}).${drag ? ` ${drag.dim} ${drag.top.segment} alone accounts for ${pct(drag.top.shareOfChange)} of the drop.` : ''}${drv.decomposition ? ` Orders ${drv.decomposition.orders[0]} → ${drv.decomposition.orders[1]}, average order ${$(drv.decomposition.aov[0])} → ${$(drv.decomposition.aov[1])}.` : ''}`,
          evidence: { baseline: drv.baseline, current: drv.current, changePct: drv.changePct, t, window: w.label, decomposition: drv.decomposition, topDrags: drv.byDimension.map((d) => ({ dimension: d.dimension, drags: d.drags.slice(0, 3) })) },
          impactUsd: round(drv.baseline - drv.current), impactBasis: `Revenue lost over the ${w.label.split(' vs ')[0]}`,
          nextAction: drag ? `Start with ${drag.dim} ${drag.top.segment}: it explains most of the decline.` : 'Break the decline down by product and customer to find the cause.',
        }));
      }
    }
    // 4. Layer 2: scan every segment for ones falling behind the rest of the business
    const scan = scanAnomalies(rows, fm, { days });
    for (const a of scan?.anomalies.slice(0, 5) ?? []) {
      out.push(mk({
        id: `anomaly-${a.dimension}-${a.segment}`, category: 'anomaly',
        title: `${a.dimension} ${a.segment}: ${a.changePct < 0 ? 'down' : 'up'} ${pct(Math.abs(a.changePct))} while the business ${a.overallChangePct >= 0 ? 'grew' : 'fell'} ${pct(Math.abs(a.overallChangePct))}`,
        severity: a.gapPts <= -50 ? 'high' : 'medium', confidence: round(Math.min(0.999, Math.max(0.5, 1 - a.q)), 3), basis: 'tested', pValue: a.q, period: scan!.windows.label.split(' vs ')[0], exposure: 'lost',
        metric: `${a.dimension} vs overall, ${scan!.windows.label}`,
        explanation: `Found by comparing ${scan!.coverage}. ${a.segment} went from ${$(a.baseline)} to ${$(a.current)}, ${Math.abs(a.gapPts)} points worse than the business overall (Welch t-test on weekly sales, adjusted ${fmtP(a.q).replace('p', 'q')}).`,
        evidence: { ...a, window: scan!.windows.label, segmentsScanned: scan!.scanned },
        impactUsd: Math.max(0, a.impact), impactBasis: 'Revenue this segment lost beyond the overall trend',
        nextAction: `Investigate what changed for ${a.segment}: stock, pricing, a lost customer, or a competitor.`,
      }));
    }
  }

  // 5. Discount vs margin relationship
  if (fm.discount && fm.profit) {
    const pairs = rows.filter((r) => typeof r[fm.discount!] === 'number' && typeof r[fm.profit!] === 'number' && typeof r[fm.measure] === 'number' && (r[fm.measure] as number) > 0);
    const r = pearson(pairs.map((p) => p[fm.discount!] as number), pairs.map((p) => (p[fm.profit!] as number) / (p[fm.measure] as number)));
    const n = pairs.length, tr = n > 2 && Math.abs(r) < 1 ? (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r) : 0, pr = tCdf(tr, Math.max(1, n - 2));
    if (r < -0.5 && pr < 0.05) {
      out.push(mk({
        id: 'pricing-discount-margin', category: 'pricing',
        title: `Bigger discounts go with thinner margins (correlation ${r.toFixed(2)})`,
        severity: r < -0.7 ? 'high' : 'medium', confidence: round(Math.min(0.999, Math.max(0.5, 1 - pr)), 3), basis: 'tested', pValue: round(pr, 4), period: null, exposure: null,
        metric: 'corr(discount, margin)',
        explanation: `Higher discounts line up strongly with lower margin across ${pairs.length} orders. Correlation shows association, not proof of cause.`,
        evidence: { pearson: round(r, 3), orders: pairs.length }, impactUsd: null, impactBasis: null,
        nextAction: 'Introduce discount approval tiers and track margin by discount band.',
      }));
    }
  }

  // 6. Dependence on very large orders (order level when order IDs exist; robust 3xIQR otherwise)
  if (transactional) {
    const totals = new Map<string, number>();
    for (const r of sales) totals.set(String(r.Order), (totals.get(String(r.Order)) ?? 0) + ((r[fm.measure] as number) || 0));
    const vals = [...totals.values()].sort((a, b) => b - a), n = Math.max(1, Math.ceil(vals.length * 0.01)), topShare = sum(vals.slice(0, n)) / sum(vals);
    if (vals.length >= 200 && topShare >= 0.2) out.push(mk({
      id: 'outlier-orders', category: 'outlier', title: `The top 1% of orders (${n.toLocaleString()}) bring in ${pct(topShare)} of revenue`,
      severity: topShare >= 0.35 ? 'high' : 'medium', confidence: 1, basis: 'measured', pValue: null, period: 'whole file', exposure: 'at-risk', metric: 'Revenue share of the largest 1% of orders',
      explanation: `${n} of ${vals.length.toLocaleString()} orders are each above ${$(vals[n - 1])}. Losing a few of these buyers would move total revenue noticeably.`,
      evidence: { topOrders: n, orders: vals.length, share: round(topShare, 4), threshold: round(vals[n - 1]) },
      impactUsd: round(sum(vals.slice(0, n))), impactBasis: 'Revenue from the largest 1% of orders',
      nextAction: 'Identify who places these orders and give them a dedicated account relationship.',
    }));
  } else {
    const vals = numeric(rows, fm.measure), b = iqrBounds(vals), hi = b.q3 + 3 * (b.q3 - b.q1);
    const outl = vals.filter((v) => v > hi), share = sum(outl) / total;
    if (outl.length && share > 0.15) out.push(mk({
      id: 'outlier-measure', category: 'outlier',
      title: `${outl.length} unusually large orders drive ${pct(share)} of ${fm.measure}`,
      severity: share > 0.3 ? 'high' : 'medium', confidence: 0.75, basis: 'rule', pValue: null, period: 'whole file', exposure: 'at-risk', metric: `${fm.measure} extreme values (3xIQR)`,
      explanation: `Values above ${$(hi)} are ${pct(outl.length / vals.length)} of rows but ${pct(share)} of total.`,
      evidence: { threshold: round(hi), count: outl.length, share: round(share, 4) },
      impactUsd: round(sum(outl)), impactBasis: 'Revenue sitting in extreme orders',
      nextAction: 'Verify the largest orders are genuine and not duplicates or entry errors.',
    }));
  }

  // 7. Layer 1: online-store checks (returns, retention, lapsed customers, stopped products, basket size, seasonality)
  for (const f of storeFindings(ds, fm)) out.push(mk(f));

  // 8. Data quality: empty columns
  for (const c of profileData(ds).columns) {
    if (c.nullPct >= 5) out.push(mk({
      id: `dq-${c.name}`, category: 'data-quality', title: `${c.name} is ${c.nullPct}% empty`,
      severity: c.nullPct >= 20 ? 'high' : 'medium', confidence: 1, basis: 'measured', pValue: null, period: null, exposure: null, metric: `${c.name} null rate`,
      explanation: `${c.nulls} of ${c.count} rows have no ${c.name}, which can bias totals and filters.`,
      evidence: { nulls: c.nulls, nullPct: c.nullPct }, impactUsd: null, impactBasis: null,
      nextAction: `Fix the source feed for ${c.name} or exclude it explicitly.`,
    }));
  }
  return out.sort((a, b) => b.score - a.score);
}

export const _q = quantile;
