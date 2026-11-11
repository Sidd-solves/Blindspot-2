import { callTool, type ToolContext } from '@blindspot/tool-contracts';
import { detectFields } from '@blindspot/analytics';
import type { Evidence } from './llm';

const usd = (n: number | null | undefined) => (n == null ? 'n/a' : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * Rule-based analyst used when no AI provider is configured. It routes the question to
 * deterministic tools and writes the answer from their outputs, so every number is real.
 */
export async function deterministicAnswer(ctx: ToolContext, q: string) {
  const s = q.toLowerCase();
  const ev: Evidence[] = [];
  const run = async (tool: string, input: unknown = {}) => {
    const r = await callTool(ctx, tool, input);
    ev.push({ tool, ok: r.ok, summary: r.ok ? 'ok' : r.error!.message, data: r.data });
    return r.data as any;
  };
  const fm = detectFields(ctx.state.view());
  let answer: string;
  if (/why|decreas|declin|drop|fell|down|lost/.test(s)) {
    const segs = await Promise.all(fm.dims.slice(0, 4).map((d) => run('interpret-segments', { dimension: d })));
    const drops = segs.flatMap((r) => (r?.segments ?? []).filter((x: any) => x.trendPct !== undefined && x.trendPct < -0.15 && (x.trendT ?? 0) <= -2).map((x: any) => ({ dim: r.dimension, ...x }))).sort((a: any, b: any) => (a.recent - a.prior) - (b.recent - b.prior));
    const w = segs[0]?.window;
    answer = drops.length
      ? `The biggest decline is ${drops[0].dim} = ${drops[0].key}: ${usd(drops[0].prior)} to ${usd(drops[0].recent)} (${pct(drops[0].trendPct)}) comparing the 6 months to ${w?.end} with the 6 months before.\n\n` +
        drops.slice(0, 4).map((d: any) => `- ${d.dim} ${d.key}: ${pct(d.trendPct)} (${usd(d.recent - d.prior)}, t = ${d.trendT})`).join('\n') +
        `\n\nNext step: check whether ${drops[0].key} lost customers, stock or sales coverage in that window. The data shows where revenue fell, not why.`
      : 'No segment shows a statistically significant decline (t <= -2) versus the prior 6 months.';
  } else if (/roi|recommend|action|should|priorit|fix/.test(s)) {
    const a = (await run('recommend-actions')).actions;
    const best = a[0];
    answer = `Highest benefit-to-effort action: ${best.intervention}\n\n` + a.slice(0, 3).map((x: any) => `- ${x.problem}: ${usd(x.expectedBenefitUsd)} expected (${x.effort} effort). ${x.benefitBasis}.`).join('\n') + '\n\nBenefits are hypothetical recovery estimates, not forecasts.';
  } else if (/underperform|weak|worst|segment|laggard/.test(s)) {
    const segs = await Promise.all(fm.dims.slice(0, 4).map((d) => run('interpret-segments', { dimension: d })));
    const issues = segs.flatMap((r) => r?.anomalies?.map((a: string) => `${r.dimension}: ${a}`) ?? []);
    answer = issues.length ? `Underperforming segments:\n\n${issues.slice(0, 6).map((i) => `- ${i}`).join('\n')}\n\nWeakest by revenue: ${segs.map((r) => `${r.dimension} ${r.weakest}`).join(', ')}.` : 'No segment shows negative margin, a margin far below peers, or a decline over 20%.';
  } else if (/concentrat|depend|customer|pareto|top/.test(s)) {
    const c = await run('interpret-concentration', {});
    answer = `${c.interpretation}\n\n` + c.groups.slice(0, 5).map((g: any) => `- ${g.key}: ${usd(g.value)} (${pct(g.share)})`).join('\n');
  } else if (/what if|scenario|simulat|churn|opex/.test(s)) {
    const r = await run('run-scenario', { levers: { churnReductionPct: 5, opexReductionPct: 8 } });
    answer = `Illustrative scenario (churn -5%, opex -8%): profit ${usd(r.baseline.profit)} to ${usd(r.scenario.profit)} (+${usd(r.delta.profit)}).\n\n${r.formulas.map((f: string) => `- ${f}`).join('\n')}\n\n${r.disclaimer}`;
  } else {
    const r = await run('analyze-dashboard-smart', { top: 5 });
    const top = r.findings[0];
    answer = top ? `Biggest risk: ${top.title} (${top.severity}, ${Math.round(top.confidence * 100)}% confidence).\n\n${top.explanation}\n\n` + r.findings.slice(1, 4).map((f: any) => `- ${f.title}`).join('\n') + `\n\nNext step: ${top.nextAction}` : 'No significant issues detected.';
  }
  return { answer, evidence: ev, mode: 'deterministic' as const, note: `Deterministic mode (no AI key). Data: ${ctx.state.view().label}.` };
}
