import type { Row } from './types';
import { round, std, mean } from './stats';

export interface SegmentStat {
  key: string; value: number; share: number; orders: number;
  profit?: number; margin?: number; recent?: number; prior?: number; trendPct?: number;
  /** Welch t statistic on monthly totals (recent vs prior window). Below -2 is a statistically meaningful decline. */
  trendT?: number;
}
export interface SegmentResult {
  dimension: string; measure: string; segments: SegmentStat[];
  strongest: string | null; weakest: string | null; anomalies: string[];
  window: { recentFrom: string; priorFrom: string; end: string } | null;
}

function welchT(a: number[], b: number[]) {
  const se = Math.sqrt(std(a) ** 2 / a.length + std(b) ** 2 / b.length);
  return se ? round((mean(a) - mean(b)) / se, 2) : 0;
}
const ms = (s: string) => Date.parse(s.length === 7 ? s + '-01' : s);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function interpretSegments(rows: Row[], dimension: string, measure: string, opts: { profit?: string | null; date?: string | null; windowDays?: number } = {}): SegmentResult {
  const { profit, date } = opts;
  const win = (opts.windowDays ?? 183) * 86400000;
  let end = 0;
  if (date) for (const r of rows) { const d = r[date]; if (typeof d === 'string') end = Math.max(end, ms(d)); }
  const recentFrom = end - win, priorFrom = end - 2 * win;
  const m = new Map<string, SegmentStat>();
  const BUCKETS = 6, bucketMs = win / BUCKETS;
  const monthly = new Map<string, { r: number[]; p: number[] }>();
  for (const r of rows) {
    const v = r[measure];
    if (typeof v !== 'number') continue;
    const k = String(r[dimension] ?? '(blank)');
    const s = m.get(k) ?? { key: k, value: 0, share: 0, orders: 0, profit: 0, recent: 0, prior: 0 };
    s.value += v; s.orders++;
    if (profit && typeof r[profit] === 'number') s.profit = (s.profit ?? 0) + (r[profit] as number);
    if (date && typeof r[date] === 'string') {
      const t = ms(r[date] as string);
      const mb = monthly.get(k) ?? { r: Array(BUCKETS).fill(0), p: Array(BUCKETS).fill(0) };
      if (t > recentFrom) { s.recent! += v; mb.r[Math.min(BUCKETS - 1, Math.floor((t - recentFrom) / bucketMs))] += v; }
      else if (t > priorFrom) { s.prior! += v; mb.p[Math.min(BUCKETS - 1, Math.floor((t - priorFrom) / bucketMs))] += v; }
      monthly.set(k, mb);
    }
    m.set(k, s);
  }
  const total = [...m.values()].reduce((a, s) => a + s.value, 0);
  const segments = [...m.values()].map((s) => ({
    ...s, value: round(s.value), share: round(s.value / total, 4),
    profit: profit ? round(s.profit ?? 0) : undefined,
    margin: profit && s.value ? round((s.profit ?? 0) / s.value, 4) : undefined,
    recent: date ? round(s.recent!) : undefined, prior: date ? round(s.prior!) : undefined,
    trendPct: date && s.prior ? round((s.recent! - s.prior!) / s.prior!, 4) : undefined,
    trendT: date && monthly.has(s.key) ? welchT(monthly.get(s.key)!.r, monthly.get(s.key)!.p) : undefined,
  })).sort((a, b) => b.value - a.value);
  const anomalies: string[] = [];
  const margins = segments.map((s) => s.margin).filter((x): x is number => x !== undefined);
  for (const s of segments) {
    if (s.margin !== undefined && s.margin < 0) anomalies.push(`${s.key} loses money (margin ${(s.margin * 100).toFixed(1)}%)`);
    else if (margins.length > 3 && std(margins) > 0 && (s.margin! - mean(margins)) / std(margins) < -1.5) anomalies.push(`${s.key} margin is far below peers`);
    if (s.trendPct !== undefined && s.trendPct <= -0.2 && (s.trendT ?? 0) <= -2) anomalies.push(`${s.key} revenue fell ${(Math.abs(s.trendPct) * 100).toFixed(0)}% vs prior window (t=${s.trendT})`);
  }
  return {
    dimension, measure, segments,
    strongest: segments[0]?.key ?? null, weakest: segments[segments.length - 1]?.key ?? null, anomalies,
    window: date && end ? { recentFrom: iso(recentFrom), priorFrom: iso(priorFrom), end: iso(end) } : null,
  };
}

/** Two-way table of sum(measure) (or sum(measure)/sum(ratioOf) when given, e.g. margin). */
export function crosstab(rows: Row[], rowDim: string, colDim: string, measure: string, ratioOf?: string) {
  const cells = new Map<string, { m: number; d: number; n: number }>();
  const rs = new Set<string>(), cs = new Set<string>();
  for (const r of rows) {
    const a = String(r[rowDim] ?? '(blank)'), b = String(r[colDim] ?? '(blank)');
    rs.add(a); cs.add(b);
    const k = a + '\u0000' + b, c = cells.get(k) ?? { m: 0, d: 0, n: 0 };
    c.m += typeof r[measure] === 'number' ? (r[measure] as number) : 0;
    if (ratioOf) c.d += typeof r[ratioOf] === 'number' ? (r[ratioOf] as number) : 0;
    c.n++; cells.set(k, c);
  }
  const rowsOut = [...rs].sort(), cols = [...cs].sort();
  return {
    rowDim, colDim, measure, ratioOf: ratioOf ?? null, rows: rowsOut, cols,
    values: rowsOut.map((a) => cols.map((b) => { const c = cells.get(a + '\u0000' + b); return c ? round(ratioOf ? (c.d ? c.m / c.d : 0) : c.m, 4) : null; })),
    counts: rowsOut.map((a) => cols.map((b) => cells.get(a + '\u0000' + b)?.n ?? 0)),
  };
}
