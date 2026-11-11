/**
 * "Was it the promo?" Did sales really change after a date the owner marks (a promotion, a price change, free
 * shipping), or would they have moved anyway?
 *
 * Weekly sales are compared with the same weeks a year earlier, so the season is controlled for: each week becomes a
 * year-over-year ratio. If the change worked, the ratio after the date is higher than in the 8 weeks before. That
 * difference is tested with a Welch t-test on the log ratios (a difference-in-differences). Without a year of
 * history the test falls back to before vs after, and says the season isn't controlled.
 *
 * A placebo check runs the same test at every other week in the history where nothing was marked. If effects as big
 * as this one turn up often by chance, the page says so: that is how often this test would have cried wolf.
 */
import type { Dataset, Row } from './types';
import { detectFields } from './profile';
import { welchTest } from './stats';
import { DAY, toMs } from './time';

const WEEK = 7 * DAY;
/** Weeks start on Monday (1970-01-05 was a Monday). */
const weekOf = (t: number) => Math.floor((t - 4 * DAY) / WEEK);
const weekStart = (w: number) => new Date(w * WEEK + 4 * DAY).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

export interface ImpactInput {
  /** The date the change started (YYYY-MM-DD). */
  date: string;
  /** Weeks after the date to judge (default 8, capped by the data). */
  weeks?: number;
  /** Optionally judge one slice, e.g. { field: 'Product', value: 'Mug' }. */
  filter?: { field: string; value: string };
}

export interface ImpactResult {
  ok: boolean;
  reason?: string;
  date: string;
  label: string;
  control: 'same-weeks-last-year' | 'none';
  preWeeks: number;
  postWeeks: number;
  /** Sales change beyond what the season explains, e.g. 0.18 = 18% higher. */
  effect: number | null;
  actual: number;
  expected: number;
  extra: number;
  p: number | null;
  pTwoSided: number | null;
  method: string;
  verdict: 'rose' | 'fell' | 'no-clear-change' | 'not-enough-data';
  placebo: { tested: number; asBig: number; rate: number | null };
  weekly: { week: string; actual: number; expected: number; phase: 'before' | 'after' }[];
}

/** Weekly sales (sale rows only), with every week between first and last present. */
function weeklySales(ds: Dataset, filter?: ImpactInput['filter']) {
  const fm = detectFields(ds);
  if (!fm.date) return null;
  const by = new Map<number, number>();
  let lo = Infinity,
    hi = -Infinity;
  for (const r of ds.rows as Row[]) {
    const t = toMs(r[fm.date]);
    if (!Number.isFinite(t)) continue;
    const w = weekOf(t);
    lo = Math.min(lo, w);
    hi = Math.max(hi, w);
    if (r.IsReturn === 1) continue;
    if (filter && String(r[filter.field] ?? '') !== filter.value) continue;
    by.set(w, (by.get(w) ?? 0) + ((r[fm.measure] as number) || 0));
  }
  if (!Number.isFinite(lo)) return null;
  return { by, lo, hi, measure: fm.measure };
}

const PRE = 8;

/** The effect at event week `w0` with `post` weeks after, using log year-over-year ratios when a year back exists. */
function effectAt(y: (w: number) => number, w0: number, post: number, control: boolean) {
  const ratio = (w: number) => (control ? Math.log((y(w) + 1) / (y(w - 52) + 1)) : Math.log(y(w) + 1));
  const pre = Array.from({ length: PRE }, (_, i) => ratio(w0 - PRE + i)),
    aft = Array.from({ length: post }, (_, i) => ratio(w0 + i));
  return { pre, aft, diff: mean(aft) - mean(pre) };
}

export function eventImpact(ds: Dataset, input: ImpactInput): ImpactResult {
  const label = input.filter ? `${input.filter.field} = ${input.filter.value}` : 'All sales';
  const base: ImpactResult = {
    ok: false,
    date: input.date,
    label,
    control: 'none',
    preWeeks: 0,
    postWeeks: 0,
    effect: null,
    actual: 0,
    expected: 0,
    extra: 0,
    p: null,
    pTwoSided: null,
    method: '',
    verdict: 'not-enough-data',
    placebo: { tested: 0, asBig: 0, rate: null },
    weekly: [],
  };
  const s = weeklySales(ds, input.filter);
  const t = Date.parse(`${input.date}T00:00:00Z`);
  if (!s || !Number.isFinite(t)) return { ...base, reason: 'Needs a date column and a valid date.' };
  const y = (w: number) => s.by.get(w) ?? 0;
  // The week the change started counts as "after"; the last week in the data may be partial, so it's left out.
  const w0 = weekOf(t),
    last = s.hi - 1;
  const post = Math.min(input.weeks ?? 8, last - w0 + 1);
  if (w0 - PRE < s.lo)
    return { ...base, reason: `Needs ${PRE} weeks of sales before ${input.date} to compare with.` };
  if (post < 3)
    return {
      ...base,
      reason: `Needs at least 3 full weeks after ${input.date}; the data has ${Math.max(0, post)}.`,
    };
  const control = w0 - PRE - 52 >= s.lo;
  // Weekly ratios are meaningless when most weeks are empty (a small slice): judge only slices that sell most weeks.
  const span = Array.from({ length: PRE + post }, (_, i) => w0 - PRE + i);
  const empty = span.filter((w) => y(w) <= 0 || (control && y(w - 52) <= 0)).length;
  if (empty > span.length * 0.25)
    return {
      ...base,
      reason: `${label} had no sales in ${empty} of the ${span.length} weeks around ${input.date}${control ? ' (or the same weeks last year)' : ''}, too few to judge week by week.`,
    };
  const { pre, aft, diff } = effectAt(y, w0, post, control);
  const test = welchTest(aft, pre);

  // Expected sales after the date: last year's weeks scaled by how this year ran against last year before the date
  // (or simply the pre-date weekly average, without a year of history).
  const level = Math.exp(mean(pre));
  const exp = (w: number) => (control ? (y(w - 52) + 1) * level - 1 : level - 1);
  const weekly: ImpactResult['weekly'] = [];
  for (let w = w0 - PRE; w < w0 + post; w++)
    weekly.push({
      week: weekStart(w),
      actual: round2(y(w)),
      expected: round2(Math.max(0, exp(w))),
      phase: w < w0 ? 'before' : 'after',
    });
  const actual = weekly.filter((x) => x.phase === 'after').reduce((a, x) => a + x.actual, 0),
    expected = weekly.filter((x) => x.phase === 'after').reduce((a, x) => a + x.expected, 0);

  // Placebo: the same test at every other possible start week, away from the real one.
  const placebos: number[] = [];
  const minStart = s.lo + PRE + (control ? 52 : 0);
  for (let w = minStart; w + post - 1 <= last; w++) {
    if (Math.abs(w - w0) < PRE + post) continue;
    placebos.push(effectAt(y, w, post, control).diff);
  }
  const asBig = placebos.filter((d) => Math.abs(d) >= Math.abs(diff)).length;

  const effect = Math.exp(diff) - 1;
  const p2 = test.p;
  const verdict: ImpactResult['verdict'] =
    p2 < 0.05 && Math.abs(effect) >= 0.03 ? (effect > 0 ? 'rose' : 'fell') : 'no-clear-change';
  return {
    ok: true,
    date: input.date,
    label,
    control: control ? 'same-weeks-last-year' : 'none',
    preWeeks: PRE,
    postWeeks: post,
    effect: Math.round(effect * 10000) / 10000,
    actual: round2(actual),
    expected: round2(expected),
    extra: round2(actual - expected),
    p: Number((effect >= 0 ? test.pGreater : test.pLess).toPrecision(3)),
    pTwoSided: Number(p2.toPrecision(3)),
    method: control
      ? `Welch t-test on weekly sales ÷ the same week last year (log), ${post} weeks after vs ${PRE} before`
      : `Welch t-test on weekly sales (log), ${post} weeks after vs ${PRE} before; no year of history, so the season is not controlled`,
    verdict,
    placebo: {
      tested: placebos.length,
      asBig,
      rate: placebos.length ? Math.round((asBig / placebos.length) * 1000) / 1000 : null,
    },
    weekly,
  };
}
