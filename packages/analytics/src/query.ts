import type { Row } from './types';
import { bucket, toMs } from './time';
import { round } from './stats';

/**
 * Layer 4 ("ask anything"): a safe, declarative query engine. The AI analyst composes these specs
 * to answer questions nobody pre-built a detector for; all numbers come from this code.
 */
export type Metric = 'sum' | 'count' | 'avg' | 'median' | 'distinct' | 'min' | 'max';
export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'weekday' | 'hour';
export interface Filter {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'between';
  value: string | number | (string | number)[];
}
export interface QuerySpec {
  metric: Metric;
  measure?: string;
  groupBy?: string[];
  timeGrain?: Grain;
  dateField?: string;
  filters?: Filter[];
  from?: string;
  to?: string;
  sort?: 'desc' | 'asc' | 'key';
  limit?: number;
}
export interface QueryResult {
  columns: string[];
  rows: (string | number)[][];
  total: number;
  matchedRows: number;
  groups: number;
  truncated: boolean;
}

function pass(r: Row, f: Filter): boolean {
  const v = r[f.field];
  const n = typeof v === 'number' ? v : Number(v);
  switch (f.op) {
    case 'eq':
      return String(v) === String(f.value);
    case 'neq':
      return String(v) !== String(f.value);
    case 'in':
      return Array.isArray(f.value) && f.value.map(String).includes(String(v));
    case 'nin':
      return Array.isArray(f.value) && !f.value.map(String).includes(String(v));
    case 'contains':
      return String(v ?? '')
        .toLowerCase()
        .includes(String(f.value).toLowerCase());
    case 'gt':
      return n > Number(f.value);
    case 'gte':
      return n >= Number(f.value);
    case 'lt':
      return n < Number(f.value);
    case 'lte':
      return n <= Number(f.value);
    case 'between':
      return Array.isArray(f.value) && n >= Number(f.value[0]) && n <= Number(f.value[1]);
  }
}

export function runQuery(rows: Row[], q: QuerySpec): QueryResult {
  const from = q.from ? toMs(q.from) : -Infinity,
    to = q.to ? toMs(q.to) : Infinity;
  const groups = new Map<string, { keys: string[]; vals: number[]; distinct?: Set<string>; n: number }>();
  let matched = 0;
  for (const r of rows) {
    if (q.dateField && (from > -Infinity || to < Infinity)) {
      const t = toMs(r[q.dateField]);
      if (!(t >= from && t <= to)) continue;
    }
    if (q.filters && !q.filters.every((f) => pass(r, f))) continue;
    matched++;
    const keys = [
      ...(q.timeGrain && q.dateField ? [bucket(r[q.dateField], q.timeGrain)] : []),
      ...(q.groupBy ?? []).map((g) => String(r[g] ?? '(blank)')),
    ];
    const k = keys.join('\u0000');
    let g = groups.get(k);
    if (!g) {
      g = { keys, vals: [], n: 0, distinct: q.metric === 'distinct' ? new Set() : undefined };
      groups.set(k, g);
    }
    g.n++;
    if (q.metric === 'distinct') g.distinct!.add(String(r[q.measure!] ?? ''));
    else if (q.metric !== 'count') {
      const v = r[q.measure!];
      if (typeof v === 'number') g.vals.push(v);
    }
  }
  const agg = (g: { vals: number[]; n: number; distinct?: Set<string> }) => {
    const v = g.vals;
    switch (q.metric) {
      case 'count':
        return g.n;
      case 'distinct':
        return g.distinct!.size;
      case 'sum':
        return v.reduce((a, b) => a + b, 0);
      case 'avg':
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
      case 'median': {
        if (!v.length) return 0;
        const s = [...v].sort((a, b) => a - b),
          m = s.length >> 1;
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      }
      case 'min':
        return v.length ? v.reduce((a, b) => Math.min(a, b)) : 0;
      case 'max':
        return v.length ? v.reduce((a, b) => Math.max(a, b)) : 0;
    }
  };
  let out = [...groups.values()].map((g) => ({ keys: g.keys, value: round(agg(g), 2) }));
  const sort = q.sort ?? (q.timeGrain ? 'key' : 'desc');
  out.sort((a, b) =>
    sort === 'key'
      ? a.keys.join().localeCompare(b.keys.join())
      : sort === 'asc'
        ? a.value - b.value
        : b.value - a.value,
  );
  const limit = Math.min(q.limit ?? 50, 500);
  const label = q.metric === 'count' ? 'count' : `${q.metric}(${q.measure})`;
  const total =
    q.metric === 'sum' || q.metric === 'count'
      ? round(
          out.reduce((s, x) => s + x.value, 0),
          2,
        )
      : round(agg({ vals: rows.length ? out.map((x) => x.value) : [], n: matched }), 2);
  return {
    columns: [...(q.timeGrain && q.dateField ? [q.timeGrain] : []), ...(q.groupBy ?? []), label],
    rows: out.slice(0, limit).map((x) => [...x.keys, x.value]),
    total,
    matchedRows: matched,
    groups: out.length,
    truncated: out.length > limit,
  };
}
