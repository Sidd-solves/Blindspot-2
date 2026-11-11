/**
 * Stock & cash: products whose sales went silent and came back (likely stock-outs), and the months when cash
 * reliably runs low (seasonal dips).
 *
 * Stock-outs. Without inventory data a stock-out can't be seen directly, but its footprint can: a product that sells
 * most trading days suddenly sells nothing for a stretch, then sells again. For each product we find its longest
 * silent stretch of 5–60 *trading days* (days the shop sold anything, so closures and weekends don't count), and ask how
 * likely that silence is by chance given how often the product sold in the 8 trading weeks before (Poisson: P = e^−λk).
 * Only stretches that stay significant after Benjamini–Hochberg correction across all products are reported, and only
 * when sales resumed at a similar level afterwards. The lost sales are an estimate: the usual daily sales × the days.
 *
 * Cash crunch. Each calendar month's share of a year's sales (from full years only), shown as an index against an
 * average month, with how many of the years agree, and the money gap of the slow months at the current sales level.
 */
import type { Dataset, Row } from './types';
import { detectFields } from './profile';
import { bhAdjust } from './stats';
import { DAY, toMs } from './time';

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayKey = (t: number) => Math.floor(t / DAY);
const iso = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);

export interface StockOut {
  product: string;
  from: string;
  to: string;
  tradingDays: number;
  /** Orders per trading day in the 40 trading days before the gap. */
  rateBefore: number;
  rateAfter: number;
  /** Chance of this many silent trading days at the usual rate (Poisson). */
  p: number;
  q: number;
  /** Estimated sales lost: usual daily sales before the gap × trading days silent. */
  lostSales: number;
}

export interface StockOutReport {
  ok: boolean;
  reason?: string;
  scanned: number;
  method: string;
  items: StockOut[];
  totalLost: number;
  /** First and last trading day in the data. */
  range: [string, string] | null;
}

export function stockOuts(ds: Dataset): StockOutReport {
  const fm = detectFields(ds);
  const productCol =
    ['Product', 'Description', 'Item', 'Title'].find((c) => ds.rows[0] && c in ds.rows[0]) ??
    [...fm.highCardDims, ...fm.dims].find((c) => /product|item|sku|title|description/i.test(c));
  const method =
    'Longest run of 5–60 trading days with no sales per product, tested against its usual daily rate (Poisson), Benjamini–Hochberg corrected across products (q < 0.01); sales had to resume at half the usual rate or more.';
  if (!fm.date || !productCol)
    return {
      ok: false,
      reason: 'Needs dates and a product column.',
      scanned: 0,
      method,
      items: [],
      totalLost: 0,
      range: null,
    };

  // Trading days: any sale that day. Per product: order count and sales per trading day.
  const trading = new Set<number>();
  const per = new Map<string, Map<number, { n: number; v: number }>>();
  for (const r of ds.rows as Row[]) {
    if (r.IsReturn === 1) continue;
    const t = toMs(r[fm.date]);
    if (!Number.isFinite(t)) continue;
    const d = dayKey(t);
    trading.add(d);
    const p = String(r[productCol] ?? '');
    if (!p) continue;
    const m = per.get(p) ?? new Map();
    const e = m.get(d) ?? { n: 0, v: 0 };
    e.n += 1;
    e.v += (r[fm.measure] as number) || 0;
    m.set(d, e);
    per.set(p, m);
  }
  const days = [...trading].sort((a, b) => a - b);
  if (days.length < 120)
    return {
      ok: false,
      reason: `Needs about 6 months of trading days; this data has ${days.length}.`,
      scanned: 0,
      method,
      items: [],
      totalLost: 0,
      range: null,
    };
  const WINDOW = 40; // trading days before and after a gap used to measure the usual rate
  const MIN_GAP = 5,
    MAX_GAP = 60;

  const cands: (Omit<StockOut, 'q'> & { pRaw: number })[] = [];
  let scanned = 0;
  for (const [product, m] of per) {
    // Only products sold on at least 15% of trading days can show a meaningful gap.
    if (m.size < days.length * 0.15) continue;
    scanned++;
    // The longest silence that looks like a stock-out: 5–60 trading days (about 1–10 weeks). Longer silences are
    // products taken off sale or sold seasonally, and calling them lost sales would overstate the money.
    let best: { a: number; b: number } | null = null;
    let runStart = -1;
    for (let i = 0; i < days.length; i++) {
      const sold = m.has(days[i]);
      if (!sold && runStart < 0) runStart = i;
      if (sold && runStart >= 0) {
        const k = i - runStart;
        if (k >= MIN_GAP && k <= MAX_GAP && (!best || k > best.b - best.a)) best = { a: runStart, b: i };
        runStart = -1;
      }
    }
    // Gaps still open at the end are "stopped selling" (a separate finding), not stock-outs.
    if (!best || best.a < WINDOW) continue;
    const k = best.b - best.a;
    const before = days.slice(best.a - WINDOW, best.a),
      after = days.slice(best.b, best.b + WINDOW);
    const sum = (ds2: number[], f: (e: { n: number; v: number }) => number) =>
      ds2.reduce((s, d) => s + (m.has(d) ? f(m.get(d)!) : 0), 0);
    const rateBefore = sum(before, (e) => e.n) / before.length;
    const rateAfter = after.length ? sum(after, (e) => e.n) / after.length : 0;
    if (rateBefore < 0.33 || after.length < 10 || rateAfter < rateBefore * 0.5) continue;
    const pRaw = Math.exp(-rateBefore * k);
    const dailySales = sum(before, (e) => e.v) / before.length;
    cands.push({
      product,
      from: iso(days[best.a]),
      to: iso(days[best.b - 1]),
      tradingDays: k,
      rateBefore: round2(rateBefore),
      rateAfter: round2(rateAfter),
      p: pRaw,
      pRaw,
      lostSales: round2(dailySales * k),
    });
  }
  // Correct across every product scanned (products without a candidate gap count as p = 1).
  const ps = [...cands.map((c) => c.pRaw), ...Array(Math.max(0, scanned - cands.length)).fill(1)];
  const qs = bhAdjust(ps);
  const items = cands
    .map((c, i) => ({ ...c, q: qs[i] }))
    .filter((c) => c.q < 0.01)
    .sort((a, b) => b.lostSales - a.lostSales)
    .map(({ pRaw: _pRaw, ...c }) => ({ ...c, p: Number(c.p.toPrecision(3)), q: Number(c.q.toPrecision(3)) }));
  return {
    ok: true,
    scanned,
    method,
    items,
    totalLost: round2(items.reduce((s, c) => s + c.lostSales, 0)),
    range: [iso(days[0]), iso(days[days.length - 1])],
  };
}

export interface CashRadar {
  ok: boolean;
  reason?: string;
  years: number[];
  months: {
    month: number;
    label: string;
    /** Sales in this month ÷ an average month, averaged over full years. 1 = average. */
    index: number;
    /** How many of the full years had this month below average. */
    belowIn: number;
    /** This month at the current yearly sales level. */
    typical: number;
  }[];
  averageMonth: number;
  crunch: { label: string; gap: number }[];
  crunchGap: number;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Months that reliably bring in less than an average month, and by how much. */
export function cashRadar(ds: Dataset): CashRadar {
  const fm = detectFields(ds);
  const empty = (reason: string): CashRadar => ({
    ok: false,
    reason,
    years: [],
    months: [],
    averageMonth: 0,
    crunch: [],
    crunchGap: 0,
  });
  if (!fm.date) return empty('Needs a date column.');
  const by = new Map<string, number>();
  let maxT = -Infinity,
    minT = Infinity;
  for (const r of ds.rows as Row[]) {
    const t = toMs(r[fm.date]);
    if (!Number.isFinite(t)) continue;
    maxT = Math.max(maxT, t);
    minT = Math.min(minT, t);
    if (r.IsReturn === 1) continue;
    const d = new Date(t),
      k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    by.set(k, (by.get(k) ?? 0) + ((r[fm.measure] as number) || 0));
  }
  // Rolling 12-month "years" ending at the last full month, so partial calendar years still count.
  const last = new Date(maxT);
  let endY = last.getUTCFullYear(),
    endM = last.getUTCMonth();
  if (last.getUTCDate() < 28) {
    endM--;
    if (endM < 0) {
      endM = 11;
      endY--;
    }
  }
  const first = new Date(minT);
  const startIdx = first.getUTCFullYear() * 12 + first.getUTCMonth() + (first.getUTCDate() > 1 ? 1 : 0);
  const endIdx = endY * 12 + endM;
  const fullYears = Math.floor((endIdx - startIdx + 1) / 12);
  if (fullYears < 1) return empty('Needs at least 12 full months to see which months run short.');
  const years: number[][] = [];
  for (let y = 0; y < fullYears; y++) {
    const yr: number[] = Array(12).fill(0);
    for (let i = 0; i < 12; i++) {
      const idx = endIdx - y * 12 - 11 + i;
      yr[idx % 12] = by.get(`${Math.floor(idx / 12)}-${idx % 12}`) ?? 0;
    }
    years.push(yr);
  }
  const shares = years.map((yr) => {
    const avg = yr.reduce((s, x) => s + x, 0) / 12;
    return yr.map((x) => (avg ? x / avg : 0));
  });
  const latest = years[0],
    averageMonth = latest.reduce((s, x) => s + x, 0) / 12;
  const months = MONTH.map((label, m) => {
    const index = shares.reduce((s, sh) => s + sh[m], 0) / shares.length;
    return {
      month: m + 1,
      label,
      index: Math.round(index * 1000) / 1000,
      belowIn: shares.filter((sh) => sh[m] < 1).length,
      typical: round2(index * averageMonth),
    };
  });
  // A crunch month: at least 15% below an average month, and below average in every full year seen.
  const crunch = months
    .filter((m) => m.index <= 0.85 && m.belowIn === shares.length)
    .map((m) => ({ label: m.label, gap: round2(averageMonth - m.typical) }));
  return {
    ok: true,
    years: years.map((_, y) => Math.floor((endIdx - y * 12) / 12)),
    months,
    averageMonth: round2(averageMonth),
    crunch,
    crunchGap: round2(crunch.reduce((s, c) => s + c.gap, 0)),
  };
}
