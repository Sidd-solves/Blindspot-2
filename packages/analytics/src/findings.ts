import type { Dataset, Finding, Severity } from './types';
import { detectFields, numeric, profileData } from './profile';
import { interpretConcentration } from './concentration';
import { interpretSegments } from './segments';
import { iqrBounds, pearson, round, sum } from './stats';

const W: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const pct = (n: number) => (n * 100).toFixed(1) + '%';

function mk(f: Omit<Finding, 'score'>): Finding {
  return { ...f, score: round(W[f.severity] * 10 * f.confidence + Math.log10(1 + (f.impactUsd ?? 0)), 2) };
}

export function analyzeSmart(ds: Dataset): Finding[] {
  const fm = detectFields(ds);
  const rows = ds.rows;
  const out: Finding[] = [];
  if (!rows.length || !fm.measure) return out;
  const total = sum(numeric(rows, fm.measure));

  // 1. Concentration on high-cardinality dimensions
  for (const dim of fm.highCardDims) {
    const c = interpretConcentration(rows, dim, fm.measure);
    if (c.risk === 'low') continue;
    const top = c.groups.slice(0, 3);
    out.push(mk({
      id: `conc-${dim}`, category: 'concentration',
      title: `${pct(c.top5Share)} of ${fm.measure} comes from 5 ${dim} values`,
      severity: c.risk === 'high' ? 'high' : 'medium',
      confidence: round(Math.min(0.95, 0.6 + c.groupCount / 200), 2),
      metric: `${dim} concentration (top-5 share)`,
      explanation: `${c.groupsFor80Pct} of ${c.groupCount} ${dim} values generate 80% of ${fm.measure}. Losing a top account hits revenue directly. Top: ${top.map((g) => `${g.key} (${pct(g.share)})`).join(', ')}.`,
      evidence: { top5Share: c.top5Share, top1Share: c.top1Share, hhi: c.hhi, groupsFor80Pct: c.groupsFor80Pct, topGroups: top },
      impactUsd: round(c.groups.slice(0, 3).reduce((s, g) => s + g.value, 0)),
      impactBasis: `Revenue exposure if the top 3 ${dim} values were lost (exposure, not a forecast)`,
      nextAction: `Set an account-diversification target and assign owners to the top ${dim} values.`,
    }));
  }

  // 2 + 4. Segment profitability and trend across low-cardinality dimensions
  for (const dim of fm.dims) {
    const s = interpretSegments(rows, dim, fm.measure, { profit: fm.profit, date: fm.date });
    for (const seg of s.segments) {
      if (seg.profit !== undefined && seg.margin !== undefined && seg.margin < 0 && seg.orders >= 10) {
        out.push(mk({
          id: `loss-${dim}-${seg.key}`, category: 'profitability',
          title: `${seg.key} loses money: ${usd(Math.abs(seg.profit))} net loss`,
          severity: seg.margin < -0.05 ? 'critical' : 'high',
          confidence: round(Math.min(0.97, 0.7 + seg.orders / 1500), 2),
          metric: `${dim} = ${seg.key} margin`,
          explanation: `${seg.key} produced ${usd(seg.value)} in ${fm.measure} at a ${pct(seg.margin)} margin across ${seg.orders} orders, so every sale destroys value.`,
          evidence: { dimension: dim, segment: seg.key, margin: seg.margin, profit: seg.profit, sales: seg.value, orders: seg.orders },
          impactUsd: round(Math.abs(seg.profit)),
          impactBasis: 'Cumulative loss in the loaded period',
          nextAction: `Review pricing and discounting on ${seg.key}; cap discounts or reprice before the next quarter.`,
        }));
      }
      if (seg.trendPct !== undefined && seg.trendPct <= -0.2 && (seg.trendT ?? 0) <= -2 && seg.share >= 0.08 && s.window) {
        out.push(mk({
          id: `trend-${dim}-${seg.key}`, category: 'trend',
          title: `${seg.key} ${fm.measure} fell ${pct(Math.abs(seg.trendPct))} vs the prior 6 months`,
          severity: seg.trendPct <= -0.35 ? 'high' : 'medium',
          // Confidence from the size of the t statistic: t=-2 gives 0.6, t=-6 or beyond caps at 0.95.
          confidence: round(Math.min(0.95, 0.6 + (Math.abs(seg.trendT ?? 2) - 2) * 0.0875), 2),
          metric: `${dim} = ${seg.key} trend`,
          explanation: `${seg.key} dropped from ${usd(seg.prior!)} to ${usd(seg.recent!)} (windows ending ${s.window.end}), a statistically significant decline on monthly totals (Welch t = ${seg.trendT}). It is ${pct(seg.share)} of total ${fm.measure}.`,
          evidence: { dimension: dim, segment: seg.key, prior: seg.prior, recent: seg.recent, trendPct: seg.trendPct, welchT: seg.trendT, window: s.window },
          impactUsd: round(seg.prior! - seg.recent!),
          impactBasis: 'Revenue lost per 6-month window vs the prior window',
          nextAction: `Diagnose the ${seg.key} decline (staffing, pricing, competitor, stock-outs) and run a recovery pilot.`,
        }));
      }
    }
  }

  // 3. Discount vs margin relationship
  if (fm.discount && fm.profit) {
    const pairs = rows.filter((r) => typeof r[fm.discount!] === 'number' && typeof r[fm.profit!] === 'number' && typeof r[fm.measure] === 'number' && (r[fm.measure] as number) > 0);
    const r = pearson(pairs.map((p) => p[fm.discount!] as number), pairs.map((p) => (p[fm.profit!] as number) / (p[fm.measure] as number)));
    if (r < -0.5) {
      out.push(mk({
        id: 'pricing-discount-margin', category: 'pricing',
        title: `Discounting is eroding margin (correlation ${r.toFixed(2)})`,
        severity: r < -0.7 ? 'high' : 'medium', confidence: round(Math.min(0.95, Math.abs(r)), 2),
        metric: 'corr(discount, margin)',
        explanation: `Higher discounts line up strongly with lower margin across ${pairs.length} orders. Correlation shows association, not proof of cause.`,
        evidence: { pearson: round(r, 3), orders: pairs.length },
        impactUsd: null, impactBasis: null,
        nextAction: 'Introduce discount approval tiers and track margin by discount band.',
      }));
    }
  }

  // 5. Outliers
  const vals = numeric(rows, fm.measure);
  const b = iqrBounds(vals);
  const outl = vals.filter((v) => v > b.high);
  if (outl.length) {
    const share = sum(outl) / total;
    if (share > 0.08) out.push(mk({
      id: 'outlier-measure', category: 'outlier',
      title: `${outl.length} unusually large orders drive ${pct(share)} of ${fm.measure}`,
      severity: share > 0.2 ? 'high' : 'medium', confidence: 0.8, metric: `${fm.measure} IQR outliers`,
      explanation: `Values above ${usd(b.high)} (1.5xIQR rule) are ${pct(outl.length / vals.length)} of rows but ${pct(share)} of total.`,
      evidence: { threshold: round(b.high), count: outl.length, share: round(share, 4) },
      impactUsd: round(sum(outl)), impactBasis: 'Revenue sitting in outlier orders',
      nextAction: 'Verify the largest orders are genuine and not duplicates or entry errors.',
    }));
  }

  // 6. Data quality
  for (const c of profileData(ds).columns) {
    if (c.nullPct >= 5) out.push(mk({
      id: `dq-${c.name}`, category: 'data-quality', title: `${c.name} is ${c.nullPct}% empty`,
      severity: c.nullPct >= 20 ? 'high' : 'medium', confidence: 1, metric: `${c.name} null rate`,
      explanation: `${c.nulls} of ${c.count} rows have no ${c.name}, which can bias totals and filters.`,
      evidence: { nulls: c.nulls, nullPct: c.nullPct }, impactUsd: null, impactBasis: null,
      nextAction: `Fix the source feed for ${c.name} or exclude it explicitly.`,
    }));
  }
  return out.sort((a, b) => b.score - a.score);
}
