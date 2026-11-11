import type { Row } from './types';

export const DAY = 86400000;
// Sales logs repeat a few hundred dates across millions of rows, so parsed dates are memoized.
const msCache = new Map<string, number>();
export const toMs = (v: unknown) => {
  if (typeof v !== 'string') return NaN;
  let t = msCache.get(v);
  if (t === undefined) { t = Date.parse(v.length === 7 ? v + '-01' : v.slice(0, 10)); if (msCache.size < 200_000) msCache.set(v, t); }
  return t;
};
export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export function dateSpan(rows: Row[], date: string) {
  let min = Infinity, max = -Infinity;
  for (const r of rows) { const t = toMs(r[date]); if (t < min) min = t; if (t > max) max = t; }
  return { min, max, days: Number.isFinite(min) ? (max - min) / DAY : 0 };
}

export interface Windows { mode: 'year-over-year' | 'sequential'; current: [number, number]; baseline: [number, number]; label: string }

/**
 * Comparison windows ending at the latest date. With 13+ months of data we compare against the
 * same period a year earlier, so seasonality cannot masquerade as growth or decline.
 */
export function comparisonWindows(rows: Row[], date: string, days = 90): Windows | null {
  const s = dateSpan(rows, date);
  if (!Number.isFinite(s.max) || s.days < days * 2) return null;
  const end = s.max + DAY, curStart = end - days * DAY;
  if (s.days >= 365 + days) {
    return { mode: 'year-over-year', current: [curStart, end], baseline: [curStart - 365 * DAY, end - 365 * DAY], label: `last ${days} days vs same ${days} days a year earlier` };
  }
  return { mode: 'sequential', current: [curStart, end], baseline: [curStart - days * DAY, curStart], label: `last ${days} days vs the ${days} days before` };
}

/** Small shops need longer windows for statistically reliable comparisons: 90 days when busy, 180 when sparse. */
export function pickWindowDays(rows: Row[], date: string) {
  const s = dateSpan(rows, date);
  let recent = 0;
  for (const r of rows) if (toMs(r[date]) > s.max - 90 * DAY) recent++;
  return recent >= 1000 ? 90 : 180;
}

export const inWin = (t: number, w: [number, number]) => t >= w[0] && t < w[1];

export function bucket(v: unknown, grain: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'weekday' | 'hour'): string {
  const s = String(v ?? '');
  const t = toMs(s);
  if (!Number.isFinite(t)) return '(no date)';
  const d = new Date(t);
  switch (grain) {
    case 'day': return s.slice(0, 10);
    case 'week': { const m = new Date(t - ((d.getUTCDay() + 6) % 7) * DAY); return isoDay(m.getTime()); }
    case 'month': return s.slice(0, 7);
    case 'quarter': return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    case 'year': return String(d.getUTCFullYear());
    case 'weekday': return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    case 'hour': return s.length >= 13 ? s.slice(11, 13) + ':00' : '(no time)';
  }
}
