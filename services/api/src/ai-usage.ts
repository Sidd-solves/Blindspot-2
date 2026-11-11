/** Every Claude call the server makes, with tokens and an estimated cost, so the app can show what the AI did. */
const PRICE: Record<string, [number, number]> = {
  // $ per million input / output tokens
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-haiku-4-5': [1, 5],
};
export interface AiCall {
  at: number;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ms: number;
}
const log: AiCall[] = [];
export function recordAi(feature: string, model: string, usage: any, ms: number) {
  const [pi, po] = PRICE[model] ?? [4, 20];
  const inputTokens = (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0),
    outputTokens = usage?.output_tokens ?? 0;
  const call = {
    at: Date.now(),
    feature,
    model,
    inputTokens,
    outputTokens,
    costUsd: Math.round(((inputTokens * pi + outputTokens * po) / 1e6) * 1e5) / 1e5,
    ms,
  };
  log.unshift(call);
  log.length = Math.min(log.length, 200);
  return call;
}
export const aiCalls = () => log.slice();
