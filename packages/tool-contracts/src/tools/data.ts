import { z } from 'zod';
import { analyzeSmart, detectFields, profileData, pearson, numeric, interpretSegments, round, type Dataset, type Row } from '@blindspot/analytics';
import { defineTool, ToolError } from '../core';

const FindingOut = z.object({ id: z.string(), category: z.string(), title: z.string(), severity: z.enum(['critical', 'high', 'medium', 'low']), confidence: z.number(), metric: z.string(), explanation: z.string(), evidence: z.record(z.string(), z.unknown()), impactUsd: z.number().nullable(), impactBasis: z.string().nullable(), nextAction: z.string(), score: z.number() });

export const analyzeDashboardSmart = defineTool({
  name: 'analyze-dashboard-smart', category: 'Data Analysis',
  description: 'Detect revenue concentration, negative profitability, unexpected trends, outliers, pricing erosion and data gaps, ranked by business importance.',
  input: z.object({ top: z.number().int().min(1).max(50).default(15) }),
  output: z.object({ datasetLabel: z.string(), rowCount: z.number(), findings: z.array(FindingOut), bySeverity: z.record(z.string(), z.number()) }),
  async handler(ctx, { top }) {
    const v = ctx.state.view();
    const all = analyzeSmart(v);
    const bySeverity: Record<string, number> = {};
    all.forEach((f) => (bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1));
    return { datasetLabel: v.label, rowCount: v.rows.length, findings: all.slice(0, top), bySeverity };
  },
});

export const fullDataExploration = defineTool({
  name: 'full-data-exploration', category: 'Data Analysis',
  description: 'Explore the dataset: column roles, distributions, correlations, segment differences, missing values and risks.',
  input: z.object({}),
  output: z.object({ numeric: z.array(z.string()), categorical: z.array(z.string()), dates: z.array(z.string()), correlations: z.array(z.object({ a: z.string(), b: z.string(), r: z.number() })), segmentDifferences: z.array(z.object({ dimension: z.string(), best: z.string(), worst: z.string(), spreadPct: z.number() })), missing: z.array(z.object({ column: z.string(), nullPct: z.number() })), risks: z.array(z.string()) }),
  async handler(ctx) {
    const v = ctx.state.view(), p = profileData(v), fm = detectFields(v);
    const nums = p.columns.filter((c) => c.type === 'number');
    const correlations: { a: string; b: string; r: number }[] = [];
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) {
      const pairs = v.rows.filter((r) => typeof r[nums[i].name] === 'number' && typeof r[nums[j].name] === 'number');
      const r = pearson(pairs.map((x) => x[nums[i].name] as number), pairs.map((x) => x[nums[j].name] as number));
      if (Math.abs(r) >= 0.3) correlations.push({ a: nums[i].name, b: nums[j].name, r: round(r, 3) });
    }
    const segmentDifferences = fm.dims.slice(0, 6).map((d) => {
      const s = interpretSegments(v.rows, d, fm.measure);
      const best = s.segments[0], worst = s.segments[s.segments.length - 1];
      return { dimension: d, best: best?.key ?? '', worst: worst?.key ?? '', spreadPct: best && worst && worst.value ? round((best.value - worst.value) / worst.value, 3) : 0 };
    });
    return {
      numeric: nums.map((c) => c.name), categorical: p.columns.filter((c) => c.type === 'category').map((c) => c.name),
      dates: p.columns.filter((c) => c.type === 'date').map((c) => c.name),
      correlations: correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 8), segmentDifferences,
      missing: p.columns.filter((c) => c.nullPct > 0).map((c) => ({ column: c.name, nullPct: c.nullPct })),
      risks: analyzeSmart(v).slice(0, 3).map((f) => f.title),
    };
  },
});

export const profileDataTool = defineTool({
  name: 'profile-data', category: 'Data Analysis',
  description: 'Statistical profile: counts, null %, min/max, mean, median, std dev, distinct values and outlier counts per column.',
  input: z.object({ columns: z.array(z.string().max(100)).max(100).optional() }),
  output: z.object({ rowCount: z.number(), columns: z.array(z.object({ name: z.string(), type: z.string(), count: z.number(), nulls: z.number(), nullPct: z.number(), distinct: z.number() }).passthrough()) }),
  async handler(ctx, { columns }) {
    const p = profileData(ctx.state.view());
    return { rowCount: p.rowCount, columns: (columns ? p.columns.filter((c) => columns.includes(c.name)) : p.columns) as any[] };
  },
});

export const getWorksheetData = defineTool({
  name: 'get-worksheet-data', category: 'Data Analysis',
  description: 'Fetch summary data from a connected Tableau worksheet through the Extensions API (via the WebSocket bridge). Optionally load it as the session dataset.',
  input: z.object({ worksheet: z.string().min(1).max(200), maxRows: z.number().int().min(1).max(200_000).default(50_000), ignoreSelection: z.boolean().default(true), loadIntoSession: z.boolean().default(false) }),
  output: z.object({ worksheet: z.string(), rowCount: z.number(), truncated: z.boolean(), aggregated: z.literal(true), columns: z.array(z.object({ name: z.string(), dataType: z.string() })), sample: z.array(z.record(z.string(), z.unknown())), loadedIntoSession: z.boolean() }),
  async handler(ctx, input) {
    if (!ctx.bridge?.isConnected()) throw new ToolError('TABLEAU_NOT_CONNECTED', 'No Tableau extension is connected to the bridge. Open the Blindspot extension in a dashboard.');
    let res: any;
    try { res = await ctx.bridge.request('getWorksheetData', input, 60_000); }
    catch (e: any) { throw new ToolError(e?.code ?? 'BRIDGE_ERROR', e?.message ?? 'Bridge request failed'); }
    const rows: Row[] = (res.rows ?? []).slice(0, input.maxRows);
    if (input.loadIntoSession) ctx.state.setDataset({ name: `Tableau: ${input.worksheet}`, source: 'tableau', label: 'Live Tableau worksheet (summary data, aggregated)', rows });
    return { worksheet: input.worksheet, rowCount: rows.length, truncated: Boolean(res.truncated) || (res.rows?.length ?? 0) > input.maxRows, aggregated: true as const, columns: res.columns ?? [], sample: rows.slice(0, 20), loadedIntoSession: input.loadIntoSession };
  },
});

export function buildStrategy(question: string, v: Dataset) {
  const q = question.toLowerCase();
  const fm = detectFields(v);
  const steps: { tool: string; args: Record<string, unknown>; why: string }[] = [
    { tool: 'check-connection', args: {}, why: 'Confirm what data source is live before analysing.' },
    { tool: 'profile-data', args: {}, why: 'Know column types and gaps before drawing conclusions.' },
  ];
  const add = (tool: string, args: Record<string, unknown>, why: string) => steps.push({ tool, args, why });
  const wantsAll = !/(concentrat|segment|why|decline|drop|fell|trend|margin|profit|risk|roi|recommend)/.test(q);
  add('analyze-dashboard-smart', {}, 'Find and rank issues deterministically.');
  if (/concentrat|depend|customer|top|pareto/.test(q) || wantsAll) for (const d of fm.highCardDims.slice(0, 2)) add('interpret-concentration', { dimension: d }, `Quantify dependency on ${d}.`);
  if (/segment|region|category|underperform|why|decline|drop|fell|trend|margin|profit/.test(q) || wantsAll) for (const d of fm.dims.slice(0, 3)) add('interpret-segments', { dimension: d }, `Compare ${d} segments on revenue, margin and trend.`);
  if (/roi|recommend|action|should|fix|improve/.test(q) || wantsAll) add('recommend-actions', {}, 'Turn findings into ranked actions.');
  if (/scenario|what if|simulate/.test(q)) add('run-scenario', {}, 'Model a hypothetical with explicit formulas.');
  add('build-dashboard', {}, 'Show the evidence visually.');
  return { workflow: wantsAll ? 'full-analysis' : 'targeted-analysis', steps, dataVolume: v.rows.length, llmCallsNeeded: 1, note: 'Deterministic plan: the LLM only narrates the results, it does not choose tools or transfer raw rows.' };
}

export const getAnalysisStrategy = defineTool({
  name: 'get-analysis-strategy', category: 'Data Analysis',
  description: 'Return a structured analysis plan (ordered tool calls) based on the question, available columns and data volume.',
  input: z.object({ question: z.string().max(1000).default(''), businessContext: z.string().max(1000).optional() }),
  output: z.object({ workflow: z.string(), steps: z.array(z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()), why: z.string() })), dataVolume: z.number(), llmCallsNeeded: z.number(), note: z.string() }),
  async handler(ctx, { question }) { return buildStrategy(question, ctx.state.view()); },
});

const DESC: [RegExp, string][] = [
  [/sales|revenue|amount/i, 'Revenue generated by the order or line.'], [/profit|margin/i, 'Profit after cost of goods.'],
  [/discount/i, 'Share of list price given away.'], [/quantity|units/i, 'Units sold.'], [/date|time|month/i, 'When the transaction happened.'],
  [/customer|client|account/i, 'Buyer or account that placed the order.'], [/region|state|country|city/i, 'Geography of the sale.'],
  [/category|segment|product/i, 'Product or customer grouping.'],
];
export const getSemanticMetadata = defineTool({
  name: 'get-semantic-metadata', category: 'Data Analysis',
  description: 'Fields as dimensions/measures with data types and descriptions. Types come from the data; descriptions are heuristically inferred and labeled as such.',
  input: z.object({}),
  output: z.object({ source: z.string(), fields: z.array(z.object({ name: z.string(), role: z.enum(['dimension', 'measure']), dataType: z.string(), typeSource: z.string(), description: z.string(), descriptionSource: z.literal('inferred') })) }),
  async handler(ctx) {
    const v = ctx.state.view();
    return {
      source: v.source,
      fields: profileData(v).columns.map((c) => ({
        name: c.name, role: c.type === 'number' ? ('measure' as const) : ('dimension' as const), dataType: c.type,
        typeSource: v.source === 'tableau' ? 'tableau-summary-data' : 'profiled-from-rows',
        description: DESC.find(([re]) => re.test(c.name))?.[1] ?? 'No description could be inferred.', descriptionSource: 'inferred' as const,
      })),
    };
  },
});
export const DATA_TOOLS = [analyzeDashboardSmart, fullDataExploration, profileDataTool, getWorksheetData, getAnalysisStrategy, getSemanticMetadata];
void numeric;
