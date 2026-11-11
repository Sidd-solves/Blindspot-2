import type { Row } from './types';
import { round } from './stats';

export interface ConcentrationResult {
  dimension: string;
  measure: string;
  total: number;
  groupCount: number;
  top1Share: number;
  top3Share: number;
  top5Share: number;
  top10PctShare: number;
  groupsFor80Pct: number;
  hhi: number;
  risk: 'high' | 'medium' | 'low';
  groups: { key: string; value: number; share: number; cumShare: number }[];
}

export function interpretConcentration(
  rows: Row[],
  dimension: string,
  measure: string,
  limit = 25,
): ConcentrationResult {
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = r[measure];
    if (typeof v !== 'number') continue;
    const k = String(r[dimension] ?? '(blank)');
    map.set(k, (map.get(k) ?? 0) + v);
  }
  const sorted = [...map].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  let cum = 0;
  const groups = sorted.map(([key, value]) => {
    cum += value;
    return { key, value: round(value), share: round(value / total, 4), cumShare: round(cum / total, 4) };
  });
  const topN = (n: number) => groups.slice(0, n).reduce((s, g) => s + g.share, 0);
  const n = groups.length;
  const top10 = Math.max(1, Math.ceil(n * 0.1));
  const top5Share = round(topN(5), 4);
  return {
    dimension,
    measure,
    total: round(total),
    groupCount: n,
    top1Share: round(topN(1), 4),
    top3Share: round(topN(3), 4),
    top5Share,
    top10PctShare: round(topN(top10), 4),
    groupsFor80Pct: groups.findIndex((g) => g.cumShare >= 0.8) + 1 || n,
    hhi: Math.round(groups.reduce((s, g) => s + (g.share * 100) ** 2, 0)),
    risk: top5Share >= 0.5 || topN(1) >= 0.25 ? 'high' : top5Share >= 0.3 ? 'medium' : 'low',
    groups: groups.slice(0, limit),
  };
}
