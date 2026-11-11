import { z } from 'zod';
import { interpretConcentration, interpretSegments, detectFields, profileData } from '@blindspot/analytics';
import { defineTool, ToolError, type ToolContext } from '../core';

function field(ctx: ToolContext, name: string | undefined, kind: 'dim' | 'measure') {
  const v = ctx.state.view(), cols = profileData(v).columns, fm = detectFields(v);
  const n = name ?? (kind === 'measure' ? fm.measure : fm.highCardDims[0] ?? fm.dims[0]);
  const c = cols.find((x) => x.name === n);
  if (!c) throw new ToolError('UNKNOWN_FIELD', `Field "${n}" is not in the dataset.`);
  if (kind === 'measure' && c.type !== 'number') throw new ToolError('INVALID_FIELD', `"${n}" is not numeric.`);
  return { name: n, v, fm };
}

export const interpretConcentrationTool = defineTool({
  name: 'interpret-concentration', category: 'Interpretation',
  description: 'Pareto and concentration analysis: top-1/3/5 shares, groups needed for 80%, HHI index and a risk level.',
  input: z.object({ dimension: z.string().max(100).optional(), measure: z.string().max(100).optional(), limit: z.number().int().min(1).max(100).default(25) }),
  output: z.object({ dimension: z.string(), measure: z.string(), total: z.number(), groupCount: z.number(), top1Share: z.number(), top3Share: z.number(), top5Share: z.number(), top10PctShare: z.number(), groupsFor80Pct: z.number(), hhi: z.number(), risk: z.enum(['high', 'medium', 'low']), groups: z.array(z.object({ key: z.string(), value: z.number(), share: z.number(), cumShare: z.number() })), interpretation: z.string() }),
  async handler(ctx, i) {
    const d = field(ctx, i.dimension, 'dim'), m = field(ctx, i.measure, 'measure');
    // Same base as the dashboard: sales only (no returns) and known values only (no "Unknown customer" or blanks).
    const UNKNOWN = new Set(['Unknown customer', 'Guest checkout', 'Unknown', '', '(blank)', 'null', 'undefined']);
    const rows = d.v.rows.filter((r) => r.IsReturn !== 1 && !UNKNOWN.has(String(r[d.name] ?? '')));
    const c = interpretConcentration(rows, d.name, m.name, i.limit);
    const interpretation = `${c.groupsFor80Pct} of ${c.groupCount} known ${c.dimension} values (${Math.round((c.groupsFor80Pct / Math.max(1, c.groupCount)) * 100)}%) produce 80% of ${c.measure}; the largest is ${Math.round(c.top1Share * 100)}% and the top 5 are ${Math.round(c.top5Share * 100)}%. Dependency: ${c.risk} (from those shares; the HHI index ${c.hhi} is shown for reference, 10,000 = everything from one).`;
    return { ...c, interpretation };
  },
});

export const interpretSegmentsTool = defineTool({
  name: 'interpret-segments', category: 'Interpretation',
  description: 'Compare segments on revenue contribution, margin and 6-month trend; flag strongest, weakest and anomalies.',
  input: z.object({ dimension: z.string().max(100), measure: z.string().max(100).optional() }),
  output: z.object({ dimension: z.string(), measure: z.string(), segments: z.array(z.object({ key: z.string(), value: z.number(), share: z.number(), orders: z.number() }).passthrough()), strongest: z.string().nullable(), weakest: z.string().nullable(), anomalies: z.array(z.string()), window: z.object({ recentFrom: z.string(), priorFrom: z.string(), end: z.string() }).nullable() }),
  async handler(ctx, i) {
    const d = field(ctx, i.dimension, 'dim'), m = field(ctx, i.measure, 'measure');
    return interpretSegments(d.v.rows, d.name, m.name, { profit: d.fm.profit, date: d.fm.date }) as any;
  },
});
export const INTERPRET_TOOLS = [interpretConcentrationTool, interpretSegmentsTool];
