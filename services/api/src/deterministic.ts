import { callTool, type ToolContext } from '@blindspot/tool-contracts';
import { detectFields, profileData, money, type FieldMap } from '@blindspot/analytics';

/** Without an AI key, common question shapes are still answered with real queries (e.g. "top 5 products by sales", "sales by month", "average order value by country"). */
function parseSimpleQuery(q: string, cols: string[], fm: FieldMap): { spec: any; title: string; money: boolean } | null {
  const lc = (c: string) => c.toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2');
  const dim = cols.find((c) => new RegExp(`\\b(by|per|each|top \\d* ?|which) ?${lc(c).replace(/ /g, ' ?')}(e?s)?\\b`).test(q) && c !== fm.measure);
  const grain = /by month|monthly|per month/.test(q) ? 'month' : /by week|weekly/.test(q) ? 'week' : /by quarter|quarterly/.test(q) ? 'quarter' : /by year|yearly|annual/.test(q) ? 'year' : /weekday|day of (the )?week/.test(q) ? 'weekday' : /by hour|hour of/.test(q) ? 'hour' : undefined;
  if (!dim && !grain) return null;
  const n = Number(q.match(/(top|bottom|worst|best) (\d+)/)?.[2] ?? 10), asc = /bottom|worst|least|lowest/.test(q);
  const count = /how many|number of|count/.test(q), avg = /average|avg|mean|per order/.test(q);
  const measure = cols.find((c) => q.includes(lc(c)) && c !== dim) ?? fm.measure;
  const metric = count ? 'count' : avg ? 'avg' : 'sum';
  const filters = dim && /customer/i.test(dim) ? [{ field: dim, op: 'nin', value: ['Unknown customer', 'Guest checkout'] }] : undefined;
  return { spec: { metric, measure: metric === 'count' ? undefined : measure, groupBy: dim ? [dim] : undefined, filters, timeGrain: grain, sort: grain && !dim ? 'key' : asc ? 'asc' : 'desc', limit: grain && !dim ? 60 : n }, title: `${metric === 'count' ? 'Row count' : `${metric === 'avg' ? 'Average' : 'Total'} ${measure}`}${dim ? ` by ${lc(dim)}` : ''}${grain ? ` by ${grain}` : ''}`, money: metric !== 'count' && /sales|revenue|profit|amount|total/i.test(measure) };
}
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
  const cols = profileData(ctx.state.view()).columns;
  const askAnything = parseSimpleQuery(s, cols.map((c) => c.name), fm);
  if (askAnything) {
    const r = await run('query-data', askAnything.spec);
    const cur = (r as any)?.currency ?? 'USD', fmt = (v: number) => (askAnything.money ? money(v, cur) : v.toLocaleString());
    answer = r ? `${askAnything.title}:\n\n${(r.rows as any[]).slice(0, 12).map((row) => `- ${row.slice(0, -1).join(' · ')}: ${fmt(row[row.length - 1])}`).join('\n')}${r.truncated ? `\n\n(${r.groups} groups in total; showing the top ${r.rows.length}.)` : ''}` : 'That question could not be computed from this data.';
  } else if (/why|decreas|declin|drop|fell|down|lost/.test(s) && fm.date) {
    const d = await run('explain-change', {});
    if (d) {
      const cur = d.currency, top = (d.byDimension as any[]).map((x) => ({ dim: x.dimension, t: x.drags[0] })).filter((x) => x.t && !/^order/i.test(x.dim)).sort((a, b) => b.t.shareOfChange - a.t.shareOfChange);
      answer = `${d.measure} went from ${money(d.baseline, cur)} to ${money(d.current, cur)} (${(d.changePct * 100).toFixed(1)}%, ${d.windows.label}).\n\n` +
        (d.decomposition ? `- Orders: ${d.decomposition.orders[0]} → ${d.decomposition.orders[1]}; average order ${money(d.decomposition.aov[0], cur)} → ${money(d.decomposition.aov[1], cur)}\n` : '') +
        top.slice(0, 4).map((x) => `- Biggest drag in ${x.dim}: ${x.t.segment} (${money(x.t.delta, cur)})`).join('\n') +
        `\n\nThe data shows where the change came from, not why. Check stock, pricing and marketing for the top drag first.`;
    } else answer = 'Not enough history to compare two periods.';
  } else if (/why|decreas|declin|drop|fell|down|lost/.test(s)) {
    const segs = await Promise.all(fm.dims.slice(0, 4).map((d) => run('interpret-segments', { dimension: d })));
    const drops = segs.flatMap((r) => (r?.segments ?? []).filter((x: any) => x.trendPct !== undefined && x.trendPct < -0.15 && (x.trendP ?? 1) < 0.05).map((x: any) => ({ dim: r.dimension, ...x }))).sort((a: any, b: any) => (a.recent - a.prior) - (b.recent - b.prior));
    const w = segs[0]?.window;
    answer = drops.length
      ? `The biggest decline is ${drops[0].dim} = ${drops[0].key}: ${usd(drops[0].prior)} to ${usd(drops[0].recent)} (${pct(drops[0].trendPct)}) comparing the 6 months to ${w?.end} with the 6 months before.\n\n` +
        drops.slice(0, 4).map((d: any) => `- ${d.dim} ${d.key}: ${pct(d.trendPct)} (${usd(d.recent - d.prior)}, ${d.trendP < 0.001 ? 'p < 0.001' : `p = ${d.trendP}`})`).join('\n') +
        `\n\nNext step: check whether ${drops[0].key} lost customers, stock or sales coverage in that window. The data shows where revenue fell, not why.`
      : 'No segment shows a statistically significant decline (Welch t-test, p < 0.05) versus the prior 6 months.';
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
  } else if (/\b(total|overall|how much)\b/.test(s) && /sales|revenue|sold|made/.test(s)) {
    // Same definitions as Source Data: sales = every sale line before returns; returns counted separately.
    const v = ctx.state.view(), tx = 'IsReturn' in (v.rows[0] ?? {}), cur = v.currency ?? 'USD';
    let sales = 0, returns = 0; const orders = new Set<string>(), customers = new Set<string>();
    for (const r of v.rows) {
      const m = typeof r[fm.measure] === 'number' ? (r[fm.measure] as number) : 0;
      if (tx && r.IsReturn === 1) { returns += Math.abs(m); continue; }
      sales += m; if ('Order' in r) orders.add(String(r.Order));
      if ('Customer' in r && !['Unknown customer', 'Guest checkout', ''].includes(String(r.Customer))) customers.add(String(r.Customer));
    }
    answer = `Total ${fm.measure.toLowerCase()}: ${money(sales, cur)} across ${orders.size.toLocaleString() || v.rows.length.toLocaleString()} orders.\n\n` +
      (tx ? `- Returns (counted separately, not subtracted above): ${money(returns, cur)}\n- Net of returns: ${money(sales - returns, cur)}\n` : '') +
      (customers.size ? `- Known customers: ${customers.size.toLocaleString()} (sales with no customer ID are included in the total but not in this count)\n` : '') +
      `\nThese match the totals on the Source Data page, where every row can be checked.`;
  } else if (/what if|scenario|simulat|churn|opex/.test(s)) {
    const r = await run('run-scenario', { levers: { churnReductionPct: 5, opexReductionPct: 8 } });
    answer = `Illustrative scenario (churn -5%, opex -8%): profit ${usd(r.baseline.profit)} to ${usd(r.scenario.profit)} (+${usd(r.delta.profit)}).\n\n${r.formulas.map((f: string) => `- ${f}`).join('\n')}\n\n${r.disclaimer}`;
  } else {
    const r = await run('analyze-dashboard-smart', { top: 5 });
    // The biggest risk is the top problem that actually puts money at stake, not a data-cleaning note.
    const top = r.findings.find((f: any) => f.exposure === 'lost' || f.exposure === 'at-risk') ?? r.findings[0];
    answer = top ? `Biggest risk: ${top.title} (${top.severity}; ${top.basis === 'tested' ? `statistically tested, p ${top.pValue < 0.001 ? '< 0.001' : `= ${top.pValue}`}` : top.basis === 'measured' ? 'measured directly' : 'rule of thumb'}).\n\n${top.explanation}\n\n` + r.findings.filter((f: any) => f !== top).slice(0, 3).map((f: any) => `- ${f.title}`).join('\n') + `\n\nNext step: ${top.nextAction}` : 'No significant issues detected.';
  }
  return { answer, evidence: ev, mode: 'deterministic' as const, note: `Deterministic mode (no AI key). Data: ${ctx.state.view().label}.` };
}
