import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from './zod-json';
import {
  callTool,
  getTool,
  toolNames,
  checkToolAllowed,
  wrapUntrusted,
  UNTRUSTED_RULE,
  type ToolContext,
  type LlmLike,
} from '@blindspot/tool-contracts';
import { factCheck } from './verify';
import { recordAi } from './ai-usage';

/** Switchable from Settings. Sonnet 5.5 by default to keep API cost down. */
export const MODELS = ['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const;
export type ModelId = (typeof MODELS)[number];
let current: ModelId = (MODELS as readonly string[]).includes(process.env.ANTHROPIC_MODEL ?? '')
  ? (process.env.ANTHROPIC_MODEL as ModelId)
  : 'claude-sonnet-5-5';
export const getModel = () => current;
export const setModel = (m: ModelId) => {
  current = m;
};
// Server-side refusal fallback is supported on the 5.5 models; Haiku 4.5 runs without it.
const fallbackParams = (m: ModelId) =>
  m === 'claude-haiku-4-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

/** Tools the chat model may call. Read-only analysis by default; no Tableau writes from chat. */
export const CHAT_TOOLS = [
  'query-data',
  'explain-change',
  'scan-anomalies',
  'test-hypotheses',
  'analyze-dashboard-smart',
  'full-data-exploration',
  'profile-data',
  'get-semantic-metadata',
  'interpret-concentration',
  'interpret-segments',
  'transform-to-story',
  'recommend-actions',
  'run-scenario',
  'forecast-sales',
  'early-warning',
  'win-back-list',
  'stock-outs',
  'cash-radar',
  'event-impact',
  'suggest-annotations',
  'generate-executive-summary',
];

const SYSTEM = `You are Blindspot, an AI business analyst giving a second opinion on company data.
Ground every claim in tool results. For any question the other tools don't cover, compose a query-data call (group/filter/aggregate) and answer from its numbers. Use explain-change for "why did X change", forecast-sales for "what will sales be" (always quote its measured past accuracy alongside the forecast), and test-hypotheses to check a theory before stating it. Quote the numbers the tools return; never invent figures. Numbers come from deterministic tools, you only interpret.
State uncertainty plainly: correlation is not causation, scenarios are hypothetical, sample data is synthetic.
Answer in under 180 words: a direct answer, then 2-4 evidence bullets, then one recommended next step.
${UNTRUSTED_RULE}`;

export function makeLlm(): LlmLike & { client?: Anthropic } {
  if (!process.env.ANTHROPIC_API_KEY)
    return {
      configured: false,
      get model() {
        return current;
      },
    };
  const client = new Anthropic();
  return {
    configured: true,
    get model() {
      return current;
    },
    client,
    async proposeHypotheses(schema) {
      const t0 = Date.now();
      const r = await client.messages.create({
        model: current,
        max_tokens: 4000,
        system: `You propose testable business hypotheses for a small business's sales data. Reply with ONLY a JSON array (max 6) of objects:
{"claim": string, "level": "row"|"order", "metric": "avg"|"sum"|"count", "measure": <numeric column>, "a": {"label": string, "filters": [{"field": <column>, "op": "eq"|"neq"|"in"|"gt"|"gte"|"lt"|"lte"|"contains", "value": ...}]}, "b": {...same...}, "expect": "a>b"|"a<b"}
Use only the listed columns and example values. Prefer surprising, decision-relevant ideas not already tested. ${UNTRUSTED_RULE}`,
        messages: [{ role: 'user', content: wrapUntrusted('schema', schema) }],
      });
      recordAi('Business ideas', current, r.usage, Date.now() - t0);
      const text = r.content
        .filter((b) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
      try {
        const arr = JSON.parse(json);
        return Array.isArray(arr) ? arr.slice(0, 6) : [];
      } catch {
        return [];
      }
    },
    async describeImage(base64, mediaType, prompt) {
      const t0 = Date.now();
      const r = await client.messages.create({
        model: current,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType as 'image/png', data: base64 },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      });
      recordAi('Dashboard review', current, r.usage, Date.now() - t0);
      return r.content
        .filter((b) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n');
    },
  };
}

export interface Evidence {
  tool: string;
  ok: boolean;
  summary: string;
  data?: unknown;
}

export async function claudeChat(llm: ReturnType<typeof makeLlm>, ctx: ToolContext, question: string) {
  const client = llm.client!;
  const tools: Anthropic.Tool[] = CHAT_TOOLS.map((n) => {
    const t = getTool(n)!;
    return {
      name: n,
      description: t.description,
      input_schema: zodToJsonSchema(t.input) as Anthropic.Tool.InputSchema,
    };
  });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
  const evidence: Evidence[] = [];
  const allow = new Set(CHAT_TOOLS);
  let firstDraft: ReturnType<typeof factCheck> | null = null;
  for (let turn = 0; turn < 7; turn++) {
    const t0 = Date.now();
    const res: any = await (client.beta.messages.create as any)({
      model: current,
      max_tokens: 8000,
      system: SYSTEM,
      tools,
      messages,
      ...fallbackParams(current),
    });
    recordAi('AI Analyst', current, res.usage, Date.now() - t0);
    if (res.stop_reason === 'refusal')
      return { answer: 'The model declined this request.', evidence, mode: 'claude' as const };
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason !== 'tool_use') {
      const answer = res.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n');
      const fc = factCheck(answer, evidence);
      // One self-correction round: send the figures no tool returned back to the model to check or remove.
      if (fc.unverified > 0 && !firstDraft && turn < 6) {
        firstDraft = fc;
        const bad = fc.claims.filter((c) => c.status === 'unverified').map((c) => c.text);
        messages.push({
          role: 'user',
          content: `Automated fact-check: these figures in your answer do not appear in any tool result: ${bad.join(', ')}. Check each with a tool, or rewrite the answer without it. Reply with the corrected answer only.`,
        });
        continue;
      }
      return {
        answer,
        evidence,
        mode: 'claude' as const,
        factCheck: fc,
        corrected: firstDraft
          ? {
              before: firstDraft.unverified,
              after: fc.unverified,
              flagged: firstDraft.claims.filter((c) => c.status === 'unverified').map((c) => c.text),
            }
          : null,
      };
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content.filter((b: any) => b.type === 'tool_use')) {
      const gate = checkToolAllowed(block.name, toolNames(), {
        hasBridge: !!ctx.bridge?.isConnected(),
        hasImage: !!ctx.state.lastImage,
        hasRestConfig: false,
      });
      if (!allow.has(block.name) || !gate.ok) {
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          is_error: true,
          content: gate.reason ?? 'Tool not allowed in chat.',
        });
        continue;
      }
      // Nested AI calls from inside chat are not allowed; hypotheses proposed in chat are still verified by code.
      const input =
        block.name === 'test-hypotheses' ? { ...(block.input as object), useAI: false } : block.input;
      const r = await callTool(ctx, block.name, input);
      evidence.push({ tool: block.name, ok: r.ok, summary: r.ok ? 'ok' : r.error!.message, data: r.data });
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        is_error: !r.ok,
        content: wrapUntrusted(block.name, r.ok ? r.data : r.error),
      });
    }
    messages.push({ role: 'user', content: results });
  }
  return { answer: 'Stopped after 7 rounds without a final answer.', evidence, mode: 'claude' as const };
}
