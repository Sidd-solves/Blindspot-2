/**
 * Sales forecast with a proven track record.
 *
 * Monthly sales (the same definition as the Overview chart: sale rows only, by calendar month, an unfinished last
 * month left out) are forecast by four simple, explainable methods. Each method is replayed on past months using
 * only the data that existed at the time (rolling origin, one month ahead). The method used for the real forecast
 * is chosen the same way at every past month too: by its errors on the months *before* that point. So the accuracy
 * we report is the accuracy of the whole process, not of a winner picked with hindsight.
 *
 * The 80% range around each forecast comes from the process's own past misses (Student-t × their root-mean-square),
 * so it is as wide as the track record says it should be, and wider when there are only a few misses to go on.
 */
import type { Row } from './types';
/** Same month key as the Overview chart (YYYY-MM from an ISO date). */
const monthKey = (s: string) => s.slice(0, 7);

export type MethodId = 'last-month' | 'three-month-average' | 'same-month-last-year' | 'last-year-plus-trend';

export interface Method {
  id: MethodId;
  label: string;
  how: string;
  /** Months of history needed before it can forecast. */
  needs: number;
  /** Forecast `h` months after the end of `y` (h = 1 is next month). Uses only `y`. */
  predict: (y: number[], h: number) => number;
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

export const METHODS: Method[] = [
  {
    id: 'last-month',
    label: 'Same as last month',
    how: 'Next month equals the most recent full month.',
    needs: 1,
    predict: (y) => y[y.length - 1],
  },
  {
    id: 'three-month-average',
    label: '3-month average',
    how: 'Next month equals the average of the last three full months.',
    needs: 3,
    predict: (y) => sum(y.slice(-3)) / 3,
  },
  {
    id: 'same-month-last-year',
    label: 'Same month last year',
    how: 'Next month equals the same calendar month a year earlier, so seasonal peaks repeat.',
    needs: 12,
    predict: (y, h) => y[y.length - 12 + h - 1],
  },
  {
    id: 'last-year-plus-trend',
    label: 'Last year × recent trend',
    how: 'The same month a year earlier, scaled by how the last three months compare with the same three months a year before (capped at ×0.5 to ×2).',
    needs: 15,
    predict: (y, h) => {
      const n = y.length;
      const recent = sum(y.slice(n - 3)),
        before = sum(y.slice(n - 15, n - 12));
      const ratio = before > 0 ? Math.min(2, Math.max(0.5, recent / before)) : 1;
      return y[n - 12 + h - 1] * ratio;
    },
  },
];

export interface BacktestPoint {
  month: string;
  actual: number;
  predicted: number;
  method: MethodId;
  /** (actual − predicted) / predicted; null when the forecast was 0. */
  error: number | null;
  /** The range the process would have shown at the time (from misses before this month). */
  low: number | null;
  high: number | null;
  inside: boolean | null;
}

export interface MethodScore {
  id: MethodId;
  label: string;
  how: string;
  /** Weighted absolute percentage error: Σ|actual − forecast| / Σ actual, over the months it could forecast. */
  wape: number | null;
  months: number;
}

export interface ForecastResult {
  ok: boolean;
  /** Why there's no forecast (too little history, no dates). */
  reason?: string;
  measure: string;
  history: { month: string; value: number }[];
  partialMonth: string | null;
  method: { id: MethodId; label: string; how: string } | null;
  methods: MethodScore[];
  backtest: BacktestPoint[];
  accuracy: {
    /** WAPE of the whole process (method chosen fresh each month from past errors only). */
    wape: number | null;
    months: number;
    /** Share of tested months whose actual landed inside the range shown at the time. */
    hitRate: number | null;
    rangeTested: number;
    /** Average signed error: > 0 means forecasts ran low. */
    bias: number | null;
    /** Average absolute miss per tested month, in the sales currency. Defined even when sales were zero. */
    mae: number | null;
  };
  /** low/high are null when the track record can't size a range yet. */
  forecast: { month: string; value: number; low: number | null; high: number | null }[];
  coverage: number;
  notes: string[];
}

const nextMonth = (m: string, k = 1) => {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + (mo - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Does this YYYY-MM-DD date fall on the last day of its month? */
export const reachesMonthEnd = (d: string) => {
  if (d.length < 10) return false;
  const [y, m] = d.slice(0, 7).split('-').map(Number);
  return Number(d.slice(8, 10)) === new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** One-sided 90th-percentile Student-t values by degrees of freedom (1–30); beyond that, the normal 1.2816. */
const T90 = [
  3.078, 1.886, 1.638, 1.533, 1.476, 1.44, 1.415, 1.397, 1.383, 1.372, 1.363, 1.356, 1.35, 1.345, 1.341,
  1.337, 1.333, 1.33, 1.328, 1.325, 1.323, 1.321, 1.319, 1.318, 1.316, 1.315, 1.314, 1.313, 1.311, 1.31,
];
/**
 * Half-width of an 80% range, as a share of the forecast, from past relative misses: t × root-mean-square miss.
 * RMS includes any bias, and the t value widens the range when there are only a few misses to learn from
 * (plain percentiles of 3–8 misses come out too narrow).
 */
const halfWidth = (rel: number[]) =>
  (T90[Math.min(rel.length - 1, T90.length) - 1] ?? 1.2816) *
  Math.sqrt(sum(rel.map((e) => e * e)) / rel.length);

/** Monthly sales with every month between the first and last present (months with no sales count as 0). */
export function monthlySeries(rows: Row[], date: string, measure: string) {
  const sales = rows[0] && 'IsReturn' in rows[0] ? rows.filter((r) => r.IsReturn !== 1) : rows;
  const by = new Map<string, number>();
  let maxDay = '',
    minDay = '';
  for (const r of sales) {
    const d = r[date];
    if (typeof d !== 'string' || d.length < 7) continue;
    const m = monthKey(d);
    by.set(m, (by.get(m) ?? 0) + (typeof r[measure] === 'number' ? (r[measure] as number) : 0));
  }
  for (const r of rows) {
    const d = r[date];
    if (typeof d !== 'string') continue;
    if (d > maxDay) maxDay = d;
    if (!minDay || d < minDay) minDay = d;
  }
  const keys = [...by.keys()].sort();
  if (!keys.length)
    return {
      months: [] as { month: string; value: number }[],
      partial: null as string | null,
      partialStart: null as string | null,
    };
  const months: { month: string; value: number }[] = [];
  for (let m = keys[0]; m <= keys[keys.length - 1]; m = nextMonth(m))
    months.push({ month: m, value: by.get(m) ?? 0 });
  // A month counts as complete only if the data reaches its last day (the file can't say what period it was exported
  // for). An unfinished last month would look like a collapse, and a first month that starts mid-month like a dip,
  // so both are left out of training and testing.
  const partial = !reachesMonthEnd(maxDay) ? months[months.length - 1].month : null;
  const partialStart = Number(minDay.slice(8, 10)) > 1 && months.length > 1 ? months[0].month : null;
  let kept = partial ? months.slice(0, -1) : months;
  if (partialStart && kept.length && kept[0].month === partialStart) kept = kept.slice(1);
  return { months: kept, partial, partialStart };
}

/**
 * Picks the method with the lowest error on the scored months so far; before any are scored, the most informed
 * method the history allows (seasonal ones need a year of data).
 */
function choose(errs: Map<MethodId, { abs: number; act: number }>, n: number): Method {
  const usable = METHODS.filter((m) => n >= m.needs);
  let best: Method | null = null,
    bestW = Infinity;
  for (const m of usable) {
    const e = errs.get(m.id);
    if (!e || e.act <= 0) continue;
    const w = e.abs / e.act;
    if (w < bestW) {
      bestW = w;
      best = m;
    }
  }
  return best ?? usable[usable.length - 1];
}

export function forecastSales(
  rows: Row[],
  date: string | null | undefined,
  measure: string,
  opts: { horizon?: number; testMonths?: number } = {},
): ForecastResult {
  const horizon = opts.horizon ?? 3,
    testMonths = opts.testMonths ?? 12,
    coverage = 0.8;
  const empty = (
    reason: string,
    history: ForecastResult['history'] = [],
    partial: string | null = null,
  ): ForecastResult => ({
    ok: false,
    reason,
    measure,
    history,
    partialMonth: partial,
    method: null,
    methods: [],
    backtest: [],
    accuracy: { wape: null, months: 0, hitRate: null, rangeTested: 0, bias: null, mae: null },
    forecast: [],
    coverage,
    notes: [],
  });
  if (!date) return empty('Needs a date column to forecast.');
  const { months, partial, partialStart } = monthlySeries(rows, date, measure);
  const y = months.map((m) => m.value);
  if (y.length < 6)
    return empty(
      `Needs at least 6 full months of sales to forecast and check itself; this data has ${y.length}.`,
      months,
      partial,
    );

  // Rolling origin: for each past month t, forecast it from y[0..t-1] only.
  const start = Math.max(3, y.length - testMonths);
  const errs = new Map<MethodId, { abs: number; act: number; n: number }>();
  const backtest: BacktestPoint[] = [];
  const rel: number[] = []; // the process's past relative misses, in time order
  for (let t = start; t < y.length; t++) {
    const past = y.slice(0, t);
    const pick = choose(errs, t);
    const predicted = Math.max(0, pick.predict(past, 1));
    const actual = y[t];
    // Range from misses *before* this month (needs a few to mean anything).
    let low: number | null = null,
      high: number | null = null,
      inside: boolean | null = null;
    // Misses are measured against the typical level (the larger of the forecast and the recent average), so a £0
    // forecast that missed £100 still counts toward the range instead of being dropped as "undefined".
    const scale = Math.max(predicted, sum(past.slice(-3)) / Math.min(3, past.length)) || 1;
    if (rel.length >= 3) {
      const w = halfWidth(rel);
      if (w > 0) {
        low = Math.max(0, predicted - w * scale);
        high = predicted + w * scale;
        inside = actual >= low && actual <= high;
      }
    }
    const error = predicted > 0 ? (actual - predicted) / predicted : null;
    rel.push((actual - predicted) / scale);
    backtest.push({
      month: months[t].month,
      actual: round2(actual),
      predicted: round2(predicted),
      method: pick.id,
      error: error === null ? null : Math.round(error * 10000) / 10000,
      low: low === null ? null : round2(low),
      high: high === null ? null : round2(high),
      inside,
    });
    // Score every method on this month, so later choices can use it.
    for (const m of METHODS) {
      if (t < m.needs) continue;
      const p = Math.max(0, m.predict(past, 1));
      const e = errs.get(m.id) ?? { abs: 0, act: 0, n: 0 };
      e.abs += Math.abs(actual - p);
      e.act += Math.abs(actual);
      e.n++;
      errs.set(m.id, e);
    }
  }

  const absSum = sum(backtest.map((b) => Math.abs(b.actual - b.predicted))),
    actSum = sum(backtest.map((b) => Math.abs(b.actual)));
  const ranged = backtest.filter((b) => b.inside !== null);
  const signed = backtest.filter((b) => b.error !== null).map((b) => b.error as number);

  // The real forecast: the method the process would pick now, and a range from all of its past misses.
  const pick = choose(errs, y.length);
  // No range when there are too few tested months, or when every tested month was hit exactly (a zero-width range
  // would claim certainty the track record can't show).
  const w0 = rel.length >= 3 ? halfWidth(rel) : null;
  const w = w0 && w0 > 0 ? w0 : null;
  const level = Math.max(sum(y.slice(-3)) / Math.min(3, y.length), 0);
  const last = months[months.length - 1].month;
  const forecast = Array.from({ length: horizon }, (_, i) => {
    const h = i + 1;
    const value = Math.max(0, pick.predict(y, h));
    // Further-out months are less certain: widen the one-month range by √h.
    const widen = Math.sqrt(h);
    return {
      month: nextMonth(last, h),
      value: round2(value),
      low: w === null ? null : round2(Math.max(0, value - w * widen * (Math.max(value, level) || 1))),
      high: w === null ? null : round2(value + w * widen * (Math.max(value, level) || 1)),
    };
  });

  const notes: string[] = [];
  if (y.length < 13) notes.push('Less than a year of history, so seasonal methods were not used.');
  if (partial) notes.push(`${partial} is unfinished, so it was left out of training and testing.`);
  if (partialStart)
    notes.push(`${partialStart} starts mid-month, so it was left out of training and testing.`);
  if (rel.length < 3)
    notes.push('Too few tested months to measure a range yet; the forecast is shown as a single number.');
  else if (w === null)
    notes.push('Every tested month was forecast exactly, so there are no misses to size a range from yet.');
  if (w !== null && horizon > 1)
    notes.push(
      'Months 2 and 3 widen the one-month range by √2 and √3 (an assumption); the track record tests one month ahead.',
    );

  return {
    ok: true,
    measure,
    history: months.map((m) => ({ month: m.month, value: round2(m.value) })),
    partialMonth: partial,
    method: { id: pick.id, label: pick.label, how: pick.how },
    methods: METHODS.map((m) => {
      const e = errs.get(m.id);
      return {
        id: m.id,
        label: m.label,
        how: m.how,
        wape: e && e.act > 0 ? Math.round((e.abs / e.act) * 10000) / 10000 : null,
        months: e?.n ?? 0,
      };
    }),
    backtest,
    accuracy: {
      wape: actSum > 0 ? Math.round((absSum / actSum) * 10000) / 10000 : null,
      months: backtest.length,
      hitRate: ranged.length
        ? Math.round((ranged.filter((b) => b.inside).length / ranged.length) * 10000) / 10000
        : null,
      rangeTested: ranged.length,
      bias: signed.length ? Math.round((sum(signed) / signed.length) * 10000) / 10000 : null,
      mae: backtest.length ? round2(absSum / backtest.length) : null,
    },
    forecast,
    coverage,
    notes,
  };
}
