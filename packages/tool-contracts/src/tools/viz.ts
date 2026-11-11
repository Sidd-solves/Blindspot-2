import { z } from 'zod';
import { detectFields, profileData, recommendChart, validateChartFields, toStory, analyzeSmart, round, type Row } from '@blindspot/analytics';
import { defineTool, ToolError, num } from '../core';

const monthKey = (s: string) => s.slice(0, 7);
function aggregate(rows: Row[], x: string, y: string, agg: 'sum' | 'avg' | 'count', limit: number, sortByX: boolean) {
  const m = new Map<string, { s: number; n: number }>();
  for (const r of rows) {
    const k = r[x] === null || r[x] === undefined ? '(blank)' : String(r[x]);
    const e = m.get(k) ?? { s: 0, n: 0 };
    e.s += num(r[y]); e.n++; m.set(k, e);
  }
  let out = [...m].map(([k, e]) => ({ x: k, y: round(agg === 'avg' ? e.s / e.n : agg === 'count' ? e.n : e.s) }));
  out = sortByX ? out.sort((a, b) => a.x.localeCompare(b.x)) : out.sort((a, b) => b.y - a.y);
  return out.slice(0, limit);
}

export const buildDashboard = defineTool({
  name: 'build-dashboard', category: 'Visualization',
  description: 'Build an analytical dashboard: KPI cards, monthly trend, top segments and a detail table from the current data.',
  input: z.object({ title: z.string().max(120).default('Blindspot dashboard'), dimension: z.string().max(100).optional() }),
  output: z.object({ id: z.string(), title: z.string(), kpis: z.array(z.object({ label: z.string(), value: z.number(), format: z.enum(['usd', 'pct', 'int']) })), charts: z.array(z.object({ id: z.string(), type: z.string(), title: z.string(), data: z.array(z.record(z.unknown())) })) }),
  async handler(ctx, { title, dimension }) {
    const v = ctx.state.view(), fm = detectFields(v);
    if (!v.rows.length) throw new ToolError('NO_DATA', 'No rows match the current filters.');
    const rev = v.rows.reduce((s, r) => s + num(r[fm.measure]), 0);
    const prof = fm.profit ? v.rows.reduce((s, r) => s + num(r[fm.profit!]), 0) : 0;
    const kpis = [
      { label: fm.measure, value: round(rev), format: 'usd' as const },
      ...(fm.profit ? [{ label: fm.profit, value: round(prof), format: 'usd' as const }, { label: 'Margin', value: round(rev ? prof / rev : 0, 4), format: 'pct' as const }] : []),
      { label: 'Orders', value: v.rows.length, format: 'int' as const },
    ];
    const dim = dimension ?? fm.dims[0];
    const charts: { id: string; type: string; title: string; data: Record<string, unknown>[] }[] = [];
    if (fm.date) {
      const monthly = aggregate(v.rows.map((r) => ({ ...r, __m: typeof r[fm.date!] === 'string' ? monthKey(r[fm.date!] as string) : null })), '__m', fm.measure, 'sum', 120, true);
      charts.push({ id: 'trend', type: 'line', title: `${fm.measure} by month`, data: monthly });
    }
    if (dim) charts.push({ id: 'segments', type: 'bar', title: `${fm.measure} by ${dim}`, data: aggregate(v.rows, dim, fm.measure, 'sum', 12, false) });
    charts.push({ id: 'detail', type: 'table', title: 'Top orders', data: [...v.rows].sort((a, b) => num(b[fm.measure]) - num(a[fm.measure])).slice(0, 10) });
    const id = ctx.state.nextId('dash');
    ctx.state.canvas.push({ id, kind: 'dashboard', title, spec: { kpis, charts }, createdAt: new Date().toISOString() });
    return { id, title, kpis, charts };
  },
});

export const renderVisualization = defineTool({
  name: 'render-visualization', category: 'Visualization',
  description: 'Render a chart from fields. Chart type is chosen from analytical intent when not given; invalid field combinations are rejected.',
  input: z.object({ intent: z.enum(['trend', 'comparison', 'composition', 'relationship', 'single-value', 'detail']).default('comparison'), type: z.enum(['kpi', 'line', 'bar', 'table', 'scatter', 'stackedBar']).optional(), x: z.string().max(100), y: z.string().max(100), aggregate: z.enum(['sum', 'avg', 'count']).default('sum'), limit: z.number().int().min(1).max(200).default(20) }),
  output: z.object({ id: z.string(), type: z.string(), why: z.string(), warnings: z.array(z.string()), data: z.array(z.object({ x: z.string(), y: z.number() })) }),
  async handler(ctx, i) {
    const v = ctx.state.view(), cols = profileData(v).columns;
    const rec = recommendChart(i.intent), type = i.type ?? rec.type;
    const check = validateChartFields({ type, x: i.x, y: i.y }, cols);
    if (!check.valid) throw new ToolError('INVALID_CHART', check.errors.join(' '));
    const data = aggregate(v.rows, i.x, i.y, i.aggregate, i.limit, type === 'line');
    const warnings = type === 'bar' ? ['Bar axis is rendered from zero.'] : [];
    if (cols.find((c) => c.name === i.x)?.distinct! > i.limit) warnings.push(`Showing top ${i.limit} of ${cols.find((c) => c.name === i.x)!.distinct} categories.`);
    const id = ctx.state.nextId('viz');
    ctx.state.canvas.push({ id, kind: type, title: `${i.y} by ${i.x}`, spec: { type, data }, createdAt: new Date().toISOString() });
    return { id, type, why: i.type ? 'Chart type chosen by caller.' : rec.why, warnings, data };
  },
});

export const transformToStory = defineTool({
  name: 'transform-to-story', category: 'Visualization',
  description: 'Turn findings into a Problem, Evidence, Business impact, Recommendation narrative.',
  input: z.object({ top: z.number().int().min(1).max(10).default(3) }),
  output: z.object({ stories: z.array(z.object({ problem: z.string(), evidence: z.string(), businessImpact: z.string(), recommendation: z.string() })) }),
  async handler(ctx, { top }) { return { stories: analyzeSmart(ctx.state.view()).slice(0, top).map(toStory) }; },
});

export const confirmChartFields = defineTool({
  name: 'confirm-chart-fields', category: 'Visualization',
  description: 'Validate that chart dimensions and measures exist and are compatible before rendering.',
  input: z.object({ type: z.enum(['kpi', 'line', 'bar', 'table', 'scatter', 'stackedBar']), x: z.string().max(100).optional(), y: z.string().max(100).optional(), series: z.string().max(100).optional() }),
  output: z.object({ valid: z.boolean(), errors: z.array(z.string()) }),
  async handler(ctx, spec) { return validateChartFields(spec, profileData(ctx.state.view()).columns); },
});

export const toggleTooltips = defineTool({
  name: 'toggle-tooltips', category: 'Visualization',
  description: 'Turn contextual chart tooltips on or off for the canvas (toggles when "enabled" is omitted).',
  input: z.object({ enabled: z.boolean().optional() }),
  output: z.object({ enabled: z.boolean() }),
  async handler(ctx, { enabled }) { ctx.state.tooltips = enabled ?? !ctx.state.tooltips; return { enabled: ctx.state.tooltips }; },
});
export const VIZ_TOOLS = [buildDashboard, renderVisualization, transformToStory, confirmChartFields, toggleTooltips];
