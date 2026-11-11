import { z } from 'zod';
import { runQuery, explainChange, scanAnomalies, runHypothesisLibrary, testGeneric, detectFields, profileData, pickWindowDays, comparisonWindows, type GenericHypothesis } from '@blindspot/analytics';
import { defineTool, ToolError, memo, type ToolContext } from '../core';

const FilterSchema = z.object({ field: z.string().max(100), op: z.enum(['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'contains', 'between']), value: z.union([z.string().max(200), z.number(), z.array(z.union([z.string().max(200), z.number()])).max(100)]) });

function checkFields(ctx: ToolContext, fields: (string | undefined)[]) {
  const cols = new Set(profileData(ctx.state.view()).columns.map((c) => c.name));
  const bad = fields.filter((f): f is string => !!f && !cols.has(f));
  if (bad.length) throw new ToolError('UNKNOWN_FIELD', `Unknown field(s): ${bad.join(', ')}. Available: ${[...cols].join(', ')}`);
}

export const queryData = defineTool({
  name: 'query-data', category: 'Business Intelligence', core: false,
  description: 'Ask-anything engine: group, filter and aggregate the data (sum/count/avg/median/distinct/min/max), optionally by time grain (day/week/month/quarter/year/weekday/hour) and date range. Use this to answer questions no built-in detector covers.',
  input: z.object({
    metric: z.enum(['sum', 'count', 'avg', 'median', 'distinct', 'min', 'max']), measure: z.string().max(100).optional(),
    groupBy: z.array(z.string().max(100)).max(2).optional(), timeGrain: z.enum(['day', 'week', 'month', 'quarter', 'year', 'weekday', 'hour']).optional(),
    filters: z.array(FilterSchema).max(10).optional(), from: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(), to: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
    excludeReturns: z.boolean().default(true), sort: z.enum(['desc', 'asc', 'key']).optional(), limit: z.number().int().min(1).max(500).default(25),
  }),
  output: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))), total: z.number(), matchedRows: z.number(), groups: z.number(), truncated: z.boolean(), currency: z.string() }),
  async handler(ctx, q) {
    const v = ctx.state.view(), fm = detectFields(v);
    if (q.metric !== 'count' && !q.measure) throw new ToolError('INVALID_INPUT', `measure is required for ${q.metric}.`);
    checkFields(ctx, [q.measure, ...(q.groupBy ?? []), ...(q.filters ?? []).map((f) => f.field)]);
    const rows = q.excludeReturns && v.rows[0] && 'IsReturn' in v.rows[0] ? v.rows.filter((r) => r.IsReturn !== 1) : v.rows;
    const res = runQuery(rows, { ...q, dateField: fm.date ?? undefined });
    return { ...res, currency: v.currency ?? 'USD' };
  },
});

export const explainChangeTool = defineTool({
  name: 'explain-change', category: 'Business Intelligence', core: false,
  description: 'Driver analysis: compares recent revenue with the same period last year (or the previous period) and shows which products, customers, countries and segments drove the change, plus the orders x average-order-value split.',
  input: z.object({ days: z.number().int().min(14).max(365).optional() }),
  output: z.object({ windows: z.object({ mode: z.string(), label: z.string() }).passthrough(), measure: z.string(), baseline: z.number(), current: z.number(), delta: z.number(), changePct: z.number(), decomposition: z.record(z.string(), z.unknown()).optional(), byDimension: z.array(z.object({ dimension: z.string(), drags: z.array(z.record(z.string(), z.unknown())), lifts: z.array(z.record(z.string(), z.unknown())) })), currency: z.string() }),
  async handler(ctx, { days }) {
    const v = ctx.state.view(), fm = detectFields(v);
    if (!fm.date) throw new ToolError('NO_DATES', 'This data has no date column, so changes over time cannot be explained.');
    const d = days ?? pickWindowDays(v.rows, fm.date);
    const res = memo(v.rows, `explain:${d}`, () => explainChange(v.rows, fm, { days: d }));
    if (!res) throw new ToolError('NOT_ENOUGH_HISTORY', 'Need at least two comparable periods of data.');
    return { ...(res as any), windows: { ...res.windows }, currency: v.currency ?? 'USD' };
  },
});

export const scanAnomaliesTool = defineTool({
  name: 'scan-anomalies', category: 'Business Intelligence', core: false,
  description: 'Scans every significant product, customer, country and segment for ones falling behind the business as a whole (25+ points worse, significant on weekly data). Finds problems nobody asked about.',
  input: z.object({ days: z.number().int().min(14).max(365).optional(), topN: z.number().int().min(5).max(100).default(40) }),
  output: z.object({ window: z.string(), scanned: z.number(), anomalies: z.array(z.record(z.string(), z.unknown())), currency: z.string() }),
  async handler(ctx, { days, topN }) {
    const v = ctx.state.view(), fm = detectFields(v);
    if (!fm.date) throw new ToolError('NO_DATES', 'This data has no date column to scan over time.');
    const d = days ?? pickWindowDays(v.rows, fm.date);
    const res = memo(v.rows, `scan:${d}:${topN}`, () => scanAnomalies(v.rows, fm, { days: d, topN }));
    if (!res) throw new ToolError('NOT_ENOUGH_HISTORY', 'Need at least two comparable periods of data.');
    return { window: res.windows.label, scanned: res.scanned, anomalies: res.anomalies as any[], currency: v.currency ?? 'USD' };
  },
});

export const GenericHypothesisSchema = z.object({
  claim: z.string().min(5).max(200), level: z.enum(['row', 'order']), metric: z.enum(['avg', 'sum', 'count']), measure: z.string().max(100),
  a: z.object({ label: z.string().max(60), filters: z.array(FilterSchema).max(5) }), b: z.object({ label: z.string().max(60), filters: z.array(FilterSchema).max(5) }),
  expect: z.enum(['a>b', 'a<b']), minEffect: z.number().min(0).max(5).optional(),
});

export const testHypotheses = defineTool({
  name: 'test-hypotheses', category: 'Business Intelligence', core: false,
  description: 'AI suggests, math checks: runs the built-in hypothesis library and any supplied (or AI-proposed) hypotheses, returning supported / rejected / inconclusive with the statistic behind each verdict.',
  input: z.object({ hypotheses: z.array(GenericHypothesisSchema).max(10).optional(), useAI: z.boolean().default(false), includeLibrary: z.boolean().default(true) }),
  output: z.object({ results: z.array(z.object({ id: z.string(), claim: z.string(), source: z.enum(['library', 'ai']), verdict: z.enum(['supported', 'rejected', 'small-effect', 'inconclusive']), summary: z.string(), basis: z.enum(['tested', 'descriptive']), method: z.string(), p: z.number().nullable(), stat: z.object({ name: z.string(), value: z.number() }).nullable(), evidence: z.record(z.string(), z.unknown()) })), aiUsed: z.boolean(), aiNote: z.string().nullable() }),
  async handler(ctx, i) {
    const v = ctx.state.view();
    const results = i.includeLibrary ? [...memo(v.rows, 'hypotheses', () => runHypothesisLibrary(v))] : [];
    let proposals: GenericHypothesis[] = i.hypotheses ?? [], aiUsed = false, aiNote: string | null = null;
    if (i.useAI) {
      if (!ctx.llm?.configured || !ctx.llm.proposeHypotheses) aiNote = 'AI is not configured, so only the built-in library ran.';
      else {
        const fm = detectFields(v), cols = profileData(v).columns.map((c) => ({ name: c.name, type: c.type, distinct: c.distinct, examples: c.topValues?.slice(0, 5).map((t) => t.value) }));
        const raw = await ctx.llm.proposeHypotheses({ columns: cols, measure: fm.measure, date: fm.date, rows: v.rows.length, alreadyTested: results.map((r) => r.claim) });
        proposals = [...proposals, ...raw.flatMap((h) => { const p = GenericHypothesisSchema.safeParse(h); return p.success ? [p.data] : []; })];
        aiUsed = true;
      }
    }
    proposals.slice(0, 10).forEach((h, k) => results.push(testGeneric(v, h, `ai-${k + 1}`)));
    return { results, aiUsed, aiNote };
  },
});

export const EXPLORE_TOOLS = [queryData, explainChangeTool, scanAnomaliesTool, testHypotheses];
void comparisonWindows;
