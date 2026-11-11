import type { ColumnProfile, ColType, Dataset, FieldMap, Row } from './types';
import { iqrBounds, mean, median, std, round } from './stats';

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?([T ].*)?$/;

export function inferType(values: (string | number | null)[], rowCount: number): ColType {
  const v = values.filter((x) => x !== null && x !== undefined && x !== '');
  if (!v.length) return 'text';
  if (v.every((x) => typeof x === 'number' && Number.isFinite(x))) return 'number';
  if (v.every((x) => typeof x === 'string' && DATE_RE.test(x as string) && !Number.isNaN(Date.parse(x as string)))) return 'date';
  const distinct = new Set(v.map(String)).size;
  return distinct <= Math.max(30, rowCount * 0.05) ? 'category' : 'text';
}

export function profileData(ds: Dataset): { rowCount: number; columns: ColumnProfile[] } {
  const rows = ds.rows;
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const columns = cols.map((name): ColumnProfile => {
    const raw = rows.map((r) => r[name] ?? null);
    const type = inferType(raw, rows.length);
    const present = raw.filter((x) => x !== null && x !== '');
    const base: ColumnProfile = {
      name, type, count: rows.length, nulls: rows.length - present.length,
      nullPct: rows.length ? round(((rows.length - present.length) / rows.length) * 100) : 0,
      distinct: new Set(present.map(String)).size,
    };
    if (type === 'number') {
      const nums = present as number[];
      const b = iqrBounds(nums);
      return { ...base, min: Math.min(...nums), max: Math.max(...nums), mean: round(mean(nums)), median: round(median(nums)), std: round(std(nums)), outliers: nums.filter((x) => x < b.low || x > b.high).length };
    }
    if (type === 'date') {
      const s = (present as string[]).slice().sort();
      return { ...base, min: s[0], max: s[s.length - 1] };
    }
    const counts = new Map<string, number>();
    present.forEach((x) => counts.set(String(x), (counts.get(String(x)) ?? 0) + 1));
    return { ...base, topValues: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value, count })) };
  });
  return { rowCount: rows.length, columns };
}

export function detectFields(ds: Dataset): FieldMap {
  const { columns } = profileData(ds);
  const nums = columns.filter((c) => c.type === 'number');
  const find = (re: RegExp) => nums.find((c) => re.test(c.name))?.name ?? null;
  const measure = find(/sales|revenue|amount|total/i) ?? nums[0]?.name ?? '';
  const dims = columns.filter((c) => (c.type === 'category' || c.type === 'text') && c.distinct >= 2 && c.name !== measure);
  return {
    measure,
    profit: find(/profit|margin/i),
    discount: find(/discount/i),
    date: columns.find((c) => c.type === 'date')?.name ?? null,
    dims: dims.filter((c) => c.distinct <= 30).map((c) => c.name),
    highCardDims: dims.filter((c) => c.distinct >= 20).map((c) => c.name),
  };
}

export const numeric = (rows: Row[], f: string) => rows.map((r) => r[f]).filter((x): x is number => typeof x === 'number');
