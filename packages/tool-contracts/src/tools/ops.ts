import { z } from 'zod';
import { analyzeSmart, documentation, recommend } from '@blindspot/analytics';
import { defineTool, callTool, type ToolResult } from '../core';
import { buildStrategy } from './data';

const tokens = (x: unknown) => Math.ceil(JSON.stringify(x ?? null).length / 4);

/** Short, row-free summaries so the LLM sees conclusions, not raw data. */
function summarize(r: ToolResult): string {
  if (!r.ok) return `error: ${r.error?.message}`;
  const d: any = r.data;
  switch (r.tool) {
    case 'check-connection': return `tableau=${d.tableau.status}, ai=${d.ai.status}`;
    case 'profile-data': return `${d.rowCount} rows, ${d.columns.length} columns`;
    case 'analyze-dashboard-smart': return `${d.findings.length} findings; top: ${d.findings[0]?.title ?? 'none'}`;
    case 'interpret-concentration': return d.interpretation;
    case 'interpret-segments': return `strongest ${d.strongest}, weakest ${d.weakest}; ${d.anomalies.slice(0, 2).join('; ') || 'no anomalies'}`;
    case 'recommend-actions': return `${d.actions.length} actions; best: ${d.actions[0]?.intervention ?? 'none'}`;
    case 'run-scenario': return `profit delta ${d.delta.profit}`;
    case 'build-dashboard': return `${d.kpis.length} KPIs, ${d.charts.length} charts`;
    default: return 'ok';
  }
}

export const agenticAnalyst = defineTool({
  name: 'agentic-analyst', category: 'Orchestration',
  description: 'Plan and execute a structured workflow (connection, profile, findings, interpretation, actions, dashboard) server-side, returning compact summaries plus a measured token comparison.',
  input: z.object({ question: z.string().max(1000).default('Give me a full analysis'), execute: z.boolean().default(true) }),
  output: z.object({ workflow: z.string(), steps: z.array(z.object({ step: z.number(), tool: z.string(), why: z.string(), status: z.enum(['planned', 'ok', 'error']), ms: z.number(), summary: z.string() })), topFindings: z.array(z.object({ title: z.string(), severity: z.string(), impactUsd: z.number().nullable() })), tokenMeter: z.object({ naiveTokens: z.number(), workflowTokens: z.number(), savedPct: z.number(), method: z.string() }) }),
  async handler(ctx, { question, execute }) {
    const plan = buildStrategy(question, ctx.state.view());
    const steps: any[] = [];
    let fullOutputs = 0;
    for (const [i, s] of plan.steps.entries()) {
      if (!execute) { steps.push({ step: i + 1, tool: s.tool, why: s.why, status: 'planned', ms: 0, summary: '' }); continue; }
      const r = await callTool(ctx, s.tool, s.args);
      fullOutputs += tokens(r.data);
      steps.push({ step: i + 1, tool: s.tool, why: s.why, status: r.ok ? 'ok' : 'error', ms: r.ms, summary: summarize(r) });
    }
    const top = analyzeSmart(ctx.state.view()).slice(0, 3).map((f) => ({ title: f.title, severity: f.severity, impactUsd: f.impactUsd }));
    const workflowTokens = tokens({ steps: steps.map((s) => s.summary), top });
    const naiveTokens = tokens(ctx.state.view().rows) + fullOutputs;
    return { workflow: plan.workflow, steps, topFindings: top, tokenMeter: { naiveTokens, workflowTokens, savedPct: naiveTokens ? Math.round((1 - workflowTokens / naiveTokens) * 1000) / 10 : 0, method: 'Estimated at 4 chars per token: naive = raw rows plus full tool outputs sent to the model; workflow = compact step summaries only.' } };
  },
});

export const generateDocumentation = defineTool({
  name: 'generate-documentation', category: 'Documentation',
  description: 'Generate Markdown documentation of dataset, metrics, filters, methods, assumptions, findings and recommendations.',
  input: z.object({ format: z.literal('markdown').default('markdown') }),
  output: z.object({ format: z.literal('markdown'), filename: z.string(), content: z.string() }),
  async handler(ctx) {
    const v = ctx.state.view(), f = analyzeSmart(v);
    const filters = [...ctx.state.filters].map(([k, vals]) => `- ${k} in (${vals.join(', ')})`);
    const recs = recommend(f.slice(0, 5)).map((r) => `- ${r.intervention} (effort ${r.effort}; ${r.benefitBasis})`);
    const content = documentation(v, f) + `\n\n## Active filters\n${filters.join('\n') || '- none'}\n\n## Recommendations\n${recs.join('\n')}\n`;
    return { format: 'markdown' as const, filename: `blindspot-documentation-${new Date().toISOString().slice(0, 10)}.md`, content };
  },
});

export const checkConnection = defineTool({
  name: 'check-connection', category: 'Utilities',
  description: 'Report real status of the Tableau extension, WebSocket bridge, MCP tool registry and AI provider.',
  input: z.object({}),
  output: z.object({ tableau: z.object({ status: z.string(), detail: z.string() }), bridge: z.object({ status: z.string(), detail: z.string() }), mcp: z.object({ status: z.literal('ok'), detail: z.string() }), ai: z.object({ status: z.string(), detail: z.string() }), dataset: z.object({ name: z.string(), source: z.string(), label: z.string(), rows: z.number() }) }),
  async handler(ctx) {
    const ext = ctx.bridge?.isConnected() ?? false;
    let latency = '';
    if (ext) { const t = Date.now(); try { await ctx.bridge!.request('ping', {}, 3000); latency = ` (round trip ${Date.now() - t}ms)`; } catch { latency = ' (ping failed)'; } }
    const v = ctx.state.view();
    return {
      tableau: ext ? { status: 'connected', detail: `Extension connected${latency}` } : { status: 'not_connected', detail: 'No Tableau extension attached to the bridge.' },
      bridge: ctx.bridge ? { status: 'running', detail: ext ? 'Extension session active' : 'Waiting for extension' } : { status: 'not_configured', detail: 'Bridge not available in this process.' },
      mcp: { status: 'ok' as const, detail: 'Tool registry loaded' },
      ai: ctx.llm?.configured ? { status: 'configured', detail: ctx.llm.model } : { status: 'not_configured', detail: 'ANTHROPIC_API_KEY not set; deterministic mode.' },
      dataset: { name: v.name, source: v.source, label: v.label, rows: v.rows.length },
    };
  },
});

export const clearCanvas = defineTool({
  name: 'clear-canvas', category: 'Utilities',
  description: 'Remove generated visualizations and components. The dataset and filters are untouched.',
  input: z.object({}),
  output: z.object({ removed: z.number(), datasetRows: z.number() }),
  async handler(ctx) { const removed = ctx.state.canvas.length; ctx.state.canvas = []; return { removed, datasetRows: ctx.state.dataset.rows.length }; },
});

const text = (max: number) => z.string().max(max).transform((s) => s.replace(/<[^>]*>/g, ''));
export const ComponentSpec = z.discriminatedUnion('component', [
  z.object({ component: z.literal('kpi'), props: z.object({ label: text(60), value: z.number(), format: z.enum(['usd', 'pct', 'int']).default('int'), delta: z.number().optional() }).strict() }),
  z.object({ component: z.literal('callout'), props: z.object({ tone: z.enum(['info', 'success', 'warning', 'danger']), title: text(120), body: text(600) }).strict() }),
  z.object({ component: z.literal('bar'), props: z.object({ title: text(120), data: z.array(z.object({ x: text(80), y: z.number() })).max(50) }).strict() }),
  z.object({ component: z.literal('table'), props: z.object({ columns: z.array(text(60)).max(12), rows: z.array(z.array(z.union([text(200), z.number(), z.null()]))).max(100) }).strict() }),
  z.object({ component: z.literal('list'), props: z.object({ title: text(120), items: z.array(text(300)).max(30) }).strict() }),
]);

export const renderComponent = defineTool({
  name: 'render-component', category: 'Utilities',
  description: 'Render a UI component from a validated declarative spec (kpi, callout, bar, table, list). HTML is stripped and no code is ever executed.',
  input: ComponentSpec,
  output: z.object({ id: z.string(), component: z.string(), props: z.record(z.unknown()) }),
  async handler(ctx, spec) {
    const id = ctx.state.nextId('cmp');
    ctx.state.canvas.push({ id, kind: `component:${spec.component}`, title: spec.component, spec, createdAt: new Date().toISOString() });
    return { id, component: spec.component, props: spec.props as Record<string, unknown> };
  },
});
export const OPS_TOOLS = [agenticAnalyst, generateDocumentation, checkConnection, clearCanvas, renderComponent];
