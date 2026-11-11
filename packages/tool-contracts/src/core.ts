import { z, ZodError } from 'zod';
import { generateSampleDataset, type Dataset, type Row } from '@blindspot/analytics';
import type { BridgeLike } from './protocol';
import { redactSecrets } from './guardrails';

export type Category = 'Data Analysis' | 'Visualization' | 'Design Analysis' | 'Interaction' | 'Interpretation' | 'Orchestration' | 'Documentation' | 'Utilities' | 'Business Intelligence';

export class ToolError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface CanvasItem { id: string; kind: string; title: string; spec: unknown; createdAt: string }

export class SessionState {
  dataset: Dataset = generateSampleDataset();
  filters = new Map<string, string[]>();
  canvas: CanvasItem[] = [];
  tooltips = true;
  lastImage: { base64: string; mediaType: string; at: string } | null = null;
  private seq = 0;
  nextId(p: string) { return `${p}-${++this.seq}`; }
  /** Rows after session filters. Every analysis tool reads this, never the raw dataset. */
  view(): Dataset {
    if (!this.filters.size) return this.dataset;
    const rows = this.dataset.rows.filter((r: Row) => [...this.filters].every(([f, vals]) => vals.includes(String(r[f] ?? ''))));
    return { ...this.dataset, rows };
  }
  setDataset(d: Dataset) { this.dataset = d; this.filters.clear(); this.canvas = []; }
}

export interface LlmLike { configured: boolean; model: string; describeImage?(base64: string, mediaType: string, prompt: string): Promise<string> }
export interface RestConfig { serverUrl?: string; site?: string; patName?: string; patSecret?: string }

export interface ToolContext {
  state: SessionState;
  bridge?: BridgeLike;
  llm?: LlmLike;
  rest?: RestConfig;
}

export interface ToolDef<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string; category: Category; core: boolean; description: string;
  input: I; output: O; handler: (ctx: ToolContext, input: z.infer<I>) => Promise<z.infer<O>>;
}

export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(def: Omit<ToolDef<I, O>, 'core'> & { core?: boolean }): ToolDef<I, O> {
  return { core: true, ...def };
}

const REGISTRY = new Map<string, ToolDef>();
export const registerTools = (defs: ToolDef<any, any>[]) => defs.forEach((d) => REGISTRY.set(d.name, d));
export const getTool = (n: string) => REGISTRY.get(n);
export const listTools = () => [...REGISTRY.values()];
export const toolNames = () => new Set(REGISTRY.keys());

export interface ToolResult<T = unknown> { ok: boolean; tool: string; ms: number; data?: T; error?: { code: string; message: string } }

export async function callTool(ctx: ToolContext, name: string, raw: unknown, timeoutMs = 30_000): Promise<ToolResult> {
  const t0 = Date.now();
  const fail = (code: string, message: string): ToolResult => ({ ok: false, tool: name, ms: Date.now() - t0, error: { code, message: redactSecrets(message) } });
  const tool = REGISTRY.get(name);
  if (!tool) return fail('UNKNOWN_TOOL', `Tool "${name}" is not on the allowlist.`);
  let input: unknown;
  try { input = tool.input.parse(raw ?? {}); }
  catch (e) { return fail('INVALID_INPUT', e instanceof ZodError ? e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') : 'Invalid input'); }
  try {
    const data = await Promise.race([
      tool.handler(ctx, input),
      new Promise<never>((_, rej) => setTimeout(() => rej(new ToolError('TIMEOUT', `Tool exceeded ${timeoutMs}ms`)), timeoutMs)),
    ]);
    const parsed = tool.output.safeParse(data);
    if (!parsed.success) return fail('INVALID_OUTPUT', 'Tool produced output that violates its schema.');
    return { ok: true, tool: name, ms: Date.now() - t0, data: parsed.data };
  } catch (e) {
    if (e instanceof ToolError) return fail(e.code, e.message);
    return fail('INTERNAL', 'Tool failed unexpectedly.'); // details stay in server logs, not in responses
  }
}

export const num = (v: unknown) => (typeof v === 'number' ? v : 0);
