import type { Dataset, Finding, FieldMap, Row } from './types';
import { comparisonWindows, inWin, toMs, DAY, dateSpan, type Windows } from './time';
import { mean, std, round, sum, quantile } from './stats';
import { money, pctStr, plural } from './money';

type Draft = Omit<Finding, 'score'>;
const UNKNOWN = new Set(['Unknown customer', 'Guest checkout', '']);

export function welch(a: number[], b: number[]) {
  if (a.length < 2 || b.length < 2) return 0;
  const se = Math.sqrt(std(a) ** 2 / a.length + std(b) ** 2 / b.length);
  return se ? round((mean(a) - mean(b)) / se, 2) : 0;
}
/** Two-proportion z statistic (p1 - p2). */
export function propZ(x1: number, n1: number, x2: number, n2: number) {
  if (!n1 || !n2) return 0;
  const p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se ? round((x1 / n1 - x2 / n2) / se, 2) : 0;
}
const conf = (stat: number) => round(Math.min(0.97, 0.6 + Math.max(0, Math.abs(stat) - 2) * 0.09), 2);

/** Weekly totals of `measure` for rows inside a window (13 buckets for 90 days). */
function weekly(rows: Row[], date: string, measure: string, w: [number, number]) {
  const n = Math.max(1, Math.round((w[1] - w[0]) / (7 * DAY)));
  const b = new Array(n).fill(0);
  for (const r of rows) { const t = toMs(r[date]); if (inWin(t, w)) b[Math.min(n - 1, Math.floor((t - w[0]) / (7 * DAY)))] += (r[measure] as number) || 0; }
  return b;
}

// ---------------------------------------------------------------- Layer 2: what's driving a change
export interface DriverRow { segment: string; baseline: number; current: number; delta: number; shareOfChange: number; changePct: number | null }
export interface DriverResult {
  windows: Windows; measure: string; baseline: number; current: number; delta: number; changePct: number;
  decomposition?: { orders: [number, number]; aov: [number, number]; ordersEffect: number; aovEffect: number };
  byDimension: { dimension: string; drags: DriverRow[]; lifts: DriverRow[] }[];
}

export function explainChange(rows: Row[], fm: FieldMap, opts: { days?: number; dims?: string[]; windows?: Windows } = {}): DriverResult | null {
  if (!fm.date) return null;
  const w = opts.windows ?? comparisonWindows(rows, fm.date, opts.days ?? 90);
  if (!w) return null;
  const m = fm.measure, d = fm.date;
  const dims = (opts.dims ?? [...fm.dims, ...fm.highCardDims]).filter((x, i, a) => a.indexOf(x) === i && x !== 'Order' && x !== 'IsReturn');
  let base = 0, cur = 0;
  const per = dims.map(() => new Map<string, [number, number]>());
  const orders: [Set<string>, Set<string>] = [new Set(), new Set()];
  const hasOrders = rows.length > 0 && 'Order' in rows[0];
  for (const r of rows) {
    const t = toMs(r[d]); const which = inWin(t, w.current) ? 1 : inWin(t, w.baseline) ? 0 : -1;
    if (which < 0) continue;
    const ix = which as 0 | 1, v = (r[m] as number) || 0;
    if (ix) cur += v; else base += v;
    if (hasOrders && r.IsReturn !== 1) orders[ix].add(String(r.Order));
    dims.forEach((dim, i) => { const k = String(r[dim] ?? '(blank)'); const e = per[i].get(k) ?? [0, 0]; e[ix] += v; per[i].set(k, e); });
  }
  const delta = cur - base;
  const byDimension = dims.map((dim, i) => {
    const list: DriverRow[] = [...per[i]].map(([segment, [b, c]]) => ({ segment, baseline: round(b), current: round(c), delta: round(c - b), shareOfChange: delta ? round((c - b) / delta, 3) : 0, changePct: b ? round((c - b) / b, 3) : null }));
    return { dimension: dim, drags: list.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5), lifts: list.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5) };
  });
  let decomposition: DriverResult['decomposition'];
  if (hasOrders && orders[0].size && orders[1].size) {
    const o0 = orders[0].size, o1 = orders[1].size, a0 = base / o0, a1 = cur / o1;
    decomposition = { orders: [o0, o1], aov: [round(a0), round(a1)], ordersEffect: round((o1 - o0) * a0), aovEffect: round(o1 * (a1 - a0)) };
  }
  return { windows: w, measure: m, baseline: round(base), current: round(cur), delta: round(delta), changePct: base ? round(delta / base, 4) : 0, decomposition, byDimension };
}

// ---------------------------------------------------------------- Layer 2: scan every segment for anomalies
export interface Anomaly { dimension: string; segment: string; baseline: number; current: number; changePct: number; overallChangePct: number; gapPts: number; t: number; impact: number }

export function scanAnomalies(rows: Row[], fm: FieldMap, opts: { days?: number; topN?: number } = {}): { windows: Windows; anomalies: Anomaly[]; scanned: number } | null {
  if (!fm.date) return null;
  const w = comparisonWindows(rows, fm.date, opts.days ?? 90);
  if (!w) return null;
  const m = fm.measure, d = fm.date;
  const sales = 'IsReturn' in (rows[0] ?? {}) ? rows.filter((r) => r.IsReturn !== 1) : rows;
  const dims = [...fm.dims, ...fm.highCardDims].filter((x, i, a) => a.indexOf(x) === i && !/^(order|invoice|transaction)/i.test(x) && x !== 'IsReturn');
  let base = 0, cur = 0;
  for (const r of sales) { const t = toMs(r[d]); if (inWin(t, w.current)) cur += (r[m] as number) || 0; else if (inWin(t, w.baseline)) base += (r[m] as number) || 0; }
  if (!base) return null;
  const overall = (cur - base) / base, out: Anomaly[] = [];
  let scanned = 0;
  for (const dim of dims) {
    const tot = new Map<string, number>();
    for (const r of sales) { const t = toMs(r[d]); if (inWin(t, w.baseline)) tot.set(String(r[dim]), (tot.get(String(r[dim])) ?? 0) + ((r[m] as number) || 0)); }
    const top = [...tot].filter(([k, v]) => !UNKNOWN.has(k) && v >= base * 0.01).sort((a, b) => b[1] - a[1]).slice(0, opts.topN ?? 40);
    // One pass fills weekly buckets for every top segment in both windows.
    const nb = Math.max(1, Math.round((w.baseline[1] - w.baseline[0]) / (7 * DAY))), nc = Math.max(1, Math.round((w.current[1] - w.current[0]) / (7 * DAY)));
    const buckets = new Map(top.map(([seg]) => [seg, { b: new Array(nb).fill(0), c: new Array(nc).fill(0) }]));
    for (const r of sales) {
      const e = buckets.get(String(r[dim])); if (!e) continue;
      const t = toMs(r[d]), v = (r[m] as number) || 0;
      if (inWin(t, w.baseline)) e.b[Math.min(nb - 1, Math.floor((t - w.baseline[0]) / (7 * DAY)))] += v;
      else if (inWin(t, w.current)) e.c[Math.min(nc - 1, Math.floor((t - w.current[0]) / (7 * DAY)))] += v;
    }
    for (const [seg] of top) {
      scanned++;
      const { b: wb, c: wc } = buckets.get(seg)!;
      const b = sum(wb), c = sum(wc);
      const change = b ? (c - b) / b : 0, gap = change - overall, t = welch(wc, wb);
      // A segment is anomalous when it moves 25+ points worse than the whole business, significantly, and it matters in money.
      if (gap <= -0.25 && t <= -2 && b - c >= base * 0.005) out.push({ dimension: dim, segment: seg, baseline: round(b), current: round(c), changePct: round(change, 4), overallChangePct: round(overall, 4), gapPts: round(gap * 100, 1), t, impact: round(b - c - b * Math.max(0, -overall)) });
    }
  }
  return { windows: w, anomalies: out.sort((a, b) => b.impact - a.impact).slice(0, 8), scanned };
}

// ---------------------------------------------------------------- Layer 1: online-store checks
interface Order { id: string; t: number; customer: string; total: number }

function ordersOf(rows: Row[], fm: FieldMap): Order[] {
  const map = new Map<string, Order>();
  for (const r of rows) {
    if (r.IsReturn === 1) continue;
    const id = String(r.Order); let o = map.get(id);
    if (!o) { o = { id, t: toMs(r[fm.date!]), customer: String(r.Customer ?? ''), total: 0 }; map.set(id, o); }
    o.total += (r[fm.measure] as number) || 0;
  }
  return [...map.values()].filter((o) => Number.isFinite(o.t));
}

export function storeFindings(ds: Dataset, fm: FieldMap): Draft[] {
  const rows = ds.rows, cur = ds.currency ?? 'USD', $ = (n: number) => money(n, cur);
  if (!rows.length || !('Order' in rows[0]) || !('Customer' in rows[0]) || !fm.date) return [];
  const out: Draft[] = [];
  const span = dateSpan(rows, fm.date), end = span.max + DAY;
  const orders = ordersOf(rows, fm);
  const gross = sum(orders.map((o) => o.total));

  // Returns and cancellations
  if ('IsReturn' in rows[0]) {
    const byProd = new Map<string, [number, number]>();
    let returned = 0;
    for (const r of rows) {
      const v = (r[fm.measure] as number) || 0, p = String(r.Product ?? '');
      const e = byProd.get(p) ?? [0, 0];
      if (r.IsReturn === 1) { returned += Math.abs(v); e[1] += Math.abs(v); } else e[0] += v;
      byProd.set(p, e);
    }
    const rate = gross ? returned / gross : 0;
    if (rate >= 0.03) {
      const top = [...byProd].filter(([, [g]]) => g > 0).map(([product, [g, rv]]) => ({ product, returned: round(rv), rate: round(rv / g, 3) })).sort((a, b) => b.returned - a.returned).slice(0, 5);
      out.push({
        id: 'store-returns', category: 'returns', title: `${pctStr(rate)} of sales are returned or cancelled (${$(returned)})`,
        severity: rate >= 0.08 ? 'high' : 'medium', confidence: 0.95, metric: 'Returned value / gross sales',
        explanation: `${$(returned)} of ${$(gross)} in sales came back. The biggest sources: ${top.slice(0, 3).map((x) => `${x.product} (${$(x.returned)})`).join(', ')}.`,
        evidence: { returnRate: round(rate, 4), returnedValue: round(returned), grossSales: round(gross), topReturned: top },
        impactUsd: round(returned), impactBasis: 'Value of returned or cancelled items in the loaded period',
        nextAction: 'Check the top returned products for quality, description or sizing problems; consider stricter cancellation terms on large orders.',
      });
    }
  }

  // Customers with no identity
  const known = orders.filter((o) => !UNKNOWN.has(o.customer));
  const unknownSales = gross - sum(known.map((o) => o.total));
  if (gross && unknownSales / gross >= 0.1) {
    out.push({
      id: 'store-unknown-customers', category: 'data-quality', title: `You can't tell who bought ${pctStr(unknownSales / gross)} of sales`,
      severity: unknownSales / gross >= 0.2 ? 'high' : 'medium', confidence: 1, metric: 'Sales with no customer ID',
      explanation: `${$(unknownSales)} in sales has no customer attached, so those buyers can't be re-marketed to, and retention numbers undercount them.`,
      evidence: { unknownSales: round(unknownSales), share: round(unknownSales / gross, 4) }, impactUsd: round(unknownSales), impactBasis: 'Sales with no customer attached',
      nextAction: 'Require an account or email at checkout, or capture an email for receipts.',
    });
  }

  // Repeat purchase: are first-time buyers coming back less?
  const byCust = new Map<string, number[]>();
  for (const o of known) byCust.set(o.customer, [...(byCust.get(o.customer) ?? []), o.t]);
  const firsts = [...byCust.values()].map((ts) => ts.sort((a, b) => a - b)).filter((ts) => ts[0] <= end - 90 * DAY);
  if (firsts.length >= 100) {
    const mid = span.min + (end - 90 * DAY - span.min) / 2;
    const early = firsts.filter((ts) => ts[0] < mid), late = firsts.filter((ts) => ts[0] >= mid);
    const back = (g: number[][]) => g.filter((ts) => ts.length > 1 && ts[1] - ts[0] <= 90 * DAY).length;
    const be = back(early), bl = back(late), z = propZ(bl, late.length, be, early.length);
    const re = early.length ? be / early.length : 0, rl = late.length ? bl / late.length : 0;
    if (late.length >= 50 && early.length >= 50 && rl - re <= -0.05 && z <= -2) {
      out.push({
        id: 'store-retention', category: 'retention', title: `New customers are coming back less: ${pctStr(re, 0)} → ${pctStr(rl, 0)} reorder within 90 days`,
        severity: rl - re <= -0.1 ? 'high' : 'medium', confidence: conf(z), metric: '90-day repeat rate of first-time buyers',
        explanation: `Of customers who first bought in the earlier half, ${pctStr(re, 0)} ordered again within 90 days; in the later half only ${pctStr(rl, 0)} did (z = ${z}, ${late.length} customers).`,
        evidence: { earlyRate: round(re, 3), lateRate: round(rl, 3), earlyCustomers: early.length, lateCustomers: late.length, z },
        impactUsd: null, impactBasis: null, nextAction: 'Add a post-purchase email flow (thank-you, care tips, a time-limited second-order offer) and review first-order experience.',
      });
    }
  }

  // Lapsed best customers
  const cutoff = end - 90 * DAY, yearStart = cutoff - 365 * DAY;
  const prior = new Map<string, { rev: number; n: number; last: number }>();
  for (const o of known) {
    const e = prior.get(o.customer) ?? { rev: 0, n: 0, last: 0 };
    if (o.t >= yearStart && o.t < cutoff) { e.rev += o.total; e.n++; }
    e.last = Math.max(e.last, o.t); prior.set(o.customer, e);
  }
  const ranked = [...prior].filter(([, e]) => e.rev > 0).sort((a, b) => b[1].rev - a[1].rev);
  const best = ranked.slice(0, Math.max(10, Math.ceil(ranked.length * 0.1)));
  const lapsed = best.filter(([, e]) => e.n >= 3 && e.last < cutoff);
  const priorTotal = sum(ranked.map(([, e]) => e.rev));
  if (lapsed.length >= 3 && priorTotal) {
    const atRisk = sum(lapsed.map(([, e]) => e.rev));
    out.push({
      id: 'store-lapsed', category: 'retention', title: `${lapsed.length} of your best customers stopped ordering (${$(atRisk)} a year)`,
      severity: atRisk / priorTotal >= 0.05 ? 'high' : 'medium', confidence: 0.9, metric: 'Top-10% customers with no order in 90 days',
      explanation: `These customers ordered 3+ times in the prior year (${pctStr(atRisk / priorTotal)} of revenue) but haven't ordered in the last 90 days.`,
      evidence: { lapsedCustomers: lapsed.length, bestCustomers: best.length, annualRevenueAtRisk: round(atRisk), shareOfRevenue: round(atRisk / priorTotal, 4), examples: lapsed.slice(0, 5).map(([c, e]) => ({ customer: c, priorYearRevenue: round(e.rev), orders: e.n })) },
      impactUsd: round(atRisk), impactBasis: 'Their revenue in the year before they went quiet (annual exposure)',
      nextAction: 'Contact these accounts personally this week; offer a reorder incentive and ask what changed.',
    });
  }

  // Products that stopped selling (year-over-year, so seasonal items aren't flagged)
  const w = comparisonWindows(rows, fm.date, 90);
  if (w?.mode === 'year-over-year') {
    const pb = new Map<string, number>(), pc = new Map<string, number>();
    for (const r of rows) {
      if (r.IsReturn === 1) continue;
      const t = toMs(r[fm.date]), p = String(r.Product), v = (r[fm.measure] as number) || 0;
      if (inWin(t, w.baseline)) pb.set(p, (pb.get(p) ?? 0) + v); else if (inWin(t, w.current)) pc.set(p, (pc.get(p) ?? 0) + v);
    }
    const baseTot = sum([...pb.values()]);
    const stopped = [...pb].filter(([p, v]) => v >= baseTot * 0.001 && !pc.has(p)).sort((a, b) => b[1] - a[1]);
    const lost = sum(stopped.map(([, v]) => v));
    if (stopped.length >= 3 && lost >= baseTot * 0.02) {
      out.push({
        id: 'store-stopped-products', category: 'product', title: `${stopped.length} products that sold this time last year have zero sales now (${$(lost)})`,
        severity: lost >= baseTot * 0.05 ? 'high' : 'medium', confidence: 0.85, metric: 'Products with sales a year ago, none now (same 90 days)',
        explanation: `Comparing the same 90 days year over year, these products earned ${pctStr(lost / baseTot)} of sales last year and nothing now. Top: ${stopped.slice(0, 3).map(([p, v]) => `${p} (${$(v)})`).join(', ')}.`,
        evidence: { stoppedProducts: stopped.length, lostRevenue: round(lost), shareOfBaseline: round(lost / baseTot, 4), top: stopped.slice(0, 8).map(([product, v]) => ({ product, lastYear: round(v) })) },
        impactUsd: round(lost), impactBasis: 'What these products earned in the same 90 days last year',
        nextAction: 'Check whether these are out of stock, delisted or replaced; restock the best sellers.',
      });
    }
  }

  // Order value trend
  if (w) {
    const ob = orders.filter((o) => inWin(o.t, w.baseline)).map((o) => o.total), oc = orders.filter((o) => inWin(o.t, w.current)).map((o) => o.total);
    const t = welch(oc, ob), ab = mean(ob), ac = mean(oc);
    if (ob.length >= 30 && oc.length >= 30 && ab && (ac - ab) / ab <= -0.05 && t <= -2) {
      out.push({
        id: 'store-aov', category: 'trend', title: `Average order value fell ${pctStr(Math.abs((ac - ab) / ab))} (${$(ab)} → ${$(ac)})`,
        severity: (ac - ab) / ab <= -0.15 ? 'high' : 'medium', confidence: conf(t), metric: `Average order value, ${w.label}`,
        explanation: `${oc.length} recent orders averaged ${$(ac)} versus ${$(ab)} (${ob.length} orders); Welch t = ${t}.`,
        evidence: { before: round(ab), after: round(ac), ordersBefore: ob.length, ordersAfter: oc.length, t, window: w.label },
        impactUsd: round((ab - ac) * oc.length), impactBasis: `Revenue lost to smaller baskets over the ${w.label.split(' vs ')[0]}`,
        nextAction: 'Test bundles, a free-shipping threshold just above the current average, and add-on suggestions at checkout.',
      });
    }
  }

  // Seasonality: dependence on a few months
  const months = new Map<string, number>();
  for (const o of orders) if (o.t >= end - 365 * DAY) { const k = new Date(o.t).toISOString().slice(0, 7); months.set(k, (months.get(k) ?? 0) + o.total); }
  if (months.size >= 12) {
    const vals = [...months].sort((a, b) => b[1] - a[1]), yr = sum(vals.map(([, v]) => v)), top3 = vals.slice(0, 3);
    const share = sum(top3.map(([, v]) => v)) / yr;
    if (share >= 0.35) out.push({
      id: 'store-seasonality', category: 'seasonality', title: `${pctStr(share, 0)} of a year's sales land in just 3 months (${top3.map(([k]) => new Date(k + '-01').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })).join(', ')})`,
      severity: share >= 0.45 ? 'high' : 'medium', confidence: 0.95, metric: 'Top-3 months share of the last 12 months',
      explanation: `A quarter of the year carries ${pctStr(share, 0)} of revenue (an even year would be 25%), so cash, stock and staffing must be planned around the peak.`,
      evidence: { top3Share: round(share, 3), months: vals.map(([k, v]) => ({ month: k, revenue: round(v) })) }, impactUsd: null, impactBasis: null,
      nextAction: 'Build stock and cash reserves before the peak, and run off-season promotions to smooth revenue.',
    });
  }

  // Duplicates found while cleaning
  if (ds.prep && ds.prep.duplicateRows / ds.prep.inputRows >= 0.01) out.push({
    id: 'store-duplicates', category: 'data-quality', title: `${ds.prep.duplicateRows.toLocaleString()} duplicate lines in your sales records`,
    severity: 'medium', confidence: 1, metric: 'Exact duplicate rows removed during cleaning',
    explanation: `${pctStr(ds.prep.duplicateRows / ds.prep.inputRows)} of rows were exact copies. Left in, they inflate revenue in any report that doesn't remove them (Blindspot removed them before analysing).`,
    evidence: { ...ds.prep }, impactUsd: null, impactBasis: null, nextAction: 'Find where duplicates enter (double exports, sync retries) and fix the source.',
  });
  return out;
}

export const _internals = { weekly, ordersOf, quantile };
