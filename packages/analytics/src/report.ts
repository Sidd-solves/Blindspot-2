import type { Dataset, Finding } from './types';
import { detectFields, profileData } from './profile';
import { recommend } from './recommend';
import { simulateScenario } from './scenario';
import { numeric } from './profile';
import { sum } from './stats';

import { money } from './money';

/**
 * Yearly baseline for the simulator. Revenue and profit are annualised over the loaded date range, and profit stays
 * null when the data has no profit column (unknown is not zero).
 */
export const baselineOf = (ds: Dataset) => {
  const fm = detectFields(ds);
  const rows = 'IsReturn' in (ds.rows[0] ?? {}) ? ds.rows.filter((r) => r.IsReturn !== 1) : ds.rows;
  let years = 1;
  if (fm.date) {
    let lo = Infinity, hi = -Infinity;
    for (const r of ds.rows) { const t = Date.parse(String(r[fm.date])); if (Number.isFinite(t)) { if (t < lo) lo = t; if (t > hi) hi = t; } }
    if (Number.isFinite(lo) && hi > lo) years = Math.max(1, (hi - lo) / (365.25 * 86400000));
  }
  return { revenue: sum(numeric(rows, fm.measure)) / years, profit: fm.profit ? sum(numeric(rows, fm.profit)) / years : null, years };
};

export function toStory(f: Finding, currency = 'USD') {
  const usd = (n: number | null) => money(n, currency);
  return {
    problem: f.title, evidence: f.explanation,
    businessImpact: f.impactUsd !== null ? `${usd(f.impactUsd)}: ${f.impactBasis}.` : 'Not quantifiable from the loaded data.',
    recommendation: f.nextAction,
  };
}

/** The fixed report template: every topic always appears, with what was found or why it couldn't be checked. */
export const REPORT_TOPICS = [
  { key: 'customers', label: 'Customer dependence', cats: ['concentration'] },
  { key: 'profit', label: 'Profit and pricing', cats: ['profitability', 'pricing'] },
  { key: 'trend', label: 'Sales trend', cats: ['trend', 'anomaly'] },
  { key: 'retention', label: 'Repeat customers', cats: ['retention'] },
  { key: 'returns', label: 'Returns and cancellations', cats: ['returns'] },
  { key: 'products', label: 'Products', cats: ['product'] },
  { key: 'seasonality', label: 'Seasonality', cats: ['seasonality'] },
  { key: 'orders', label: 'Large-order dependence', cats: ['outlier'] },
  { key: 'data', label: 'Data quality', cats: ['data-quality'] },
] as const;

export function reportTopics(ds: Dataset, findings: Finding[]) {
  const fm = detectFields(ds), rows = ds.rows;
  const tx = rows.length > 0 && 'Order' in rows[0] && 'Customer' in rows[0];
  const hasReturns = rows.length > 0 && 'IsReturn' in rows[0];
  let months = 0;
  if (fm.date) { let mn = Infinity, mx = -Infinity; for (const r of rows) { const t = Date.parse(String(r[fm.date]).slice(0, 10)); if (t < mn) mn = t; if (t > mx) mx = t; } months = (mx - mn) / (30.4 * 86400000); }
  const missing: Record<string, string | null> = {
    customers: fm.highCardDims.length ? null : 'Needs a customer or product column.',
    profit: fm.profit ? null : 'Needs a profit or product-cost column.',
    trend: fm.date ? (months >= 6 ? null : 'Needs at least 6 months of dated sales.') : 'Needs a date column.',
    retention: tx && fm.date ? null : 'Needs customer IDs and order IDs.',
    returns: hasReturns ? null : 'Needs returns or cancellations in the data.',
    products: tx && months >= 15 ? null : 'Needs order lines with products and 15+ months of history.',
    seasonality: fm.date && months >= 12 ? null : 'Needs at least 12 months of dated sales.',
    orders: null, data: null,
  };
  return REPORT_TOPICS.map((t) => {
    const hits = findings.filter((f) => (t.cats as readonly string[]).includes(f.category));
    const status = hits.length ? 'issue' : missing[t.key] ? 'not-in-data' : 'clear';
    return { key: t.key, label: t.label, status, note: hits.length ? hits[0].title : missing[t.key] ?? 'Checked: no problem found.', count: hits.length, severity: hits[0]?.severity ?? null };
  });
}

export function roadmapFrom(recs: ReturnType<typeof recommend>) {
  const phase = (effort: string) => recs.filter((r) => r.effort === effort).map((r) => r.intervention);
  return [
    { when: '0–30 days', title: 'Quick wins', items: phase('low') },
    { when: '30–90 days', title: 'Bigger fixes', items: phase('medium') },
    { when: '90–180 days', title: 'Long-term', items: phase('high') },
  ];
}

export function executiveSummary(ds: Dataset, findings: Finding[]) {
  const usd = (n: number | null) => money(n, ds.currency);
  const base = baselineOf(ds);
  const recs = recommend(findings.slice(0, 8));
  const topics = reportTopics(ds, findings), roadmap = roadmapFrom(recs);
  const top = findings.slice(0, 3);
  const sc = simulateScenario(base, { churnReductionPct: 5, opexReductionPct: 8 });
  const md = [
    `# Executive Summary: ${ds.name}`,
    `> Data: ${ds.label}. Figures are computed from ${ds.rows.length.toLocaleString()} rows; scenarios are hypothetical.`,
    '', `**Revenue per year** ${usd(base.revenue)} | **Profit** ${base.profit === null ? 'not in your data (no cost or profit column)' : `${usd(base.profit)} per year | **Margin** ${base.revenue ? ((base.profit / base.revenue) * 100).toFixed(1) : '0'}%`}`,
    '', '## Top 3 findings',
    ...top.map((f, i) => `${i + 1}. **${f.title}** [${f.severity}, confidence ${Math.round(f.confidence * 100)}%]. ${f.explanation}`),
    '', '## Priority recommendations',
    ...recs.slice(0, 3).map((r, i) => `${i + 1}. ${r.intervention} (effort: ${r.effort}; expected ${r.benefitKind} benefit: ${usd(r.expectedBenefitUsd)}; ${r.benefitBasis}).`),
    '', '## Financial assumptions',
    `Illustrative scenario (churn -5%, opex -8%) yields **+${usd(sc.delta.profit)}** profit using: ` + sc.formulas.join('; ') + '.',
    '', '## Every topic checked',
    ...topics.map((t) => `- **${t.label}:** ${t.status === 'issue' ? '⚠ ' + t.note : t.status === 'clear' ? '✓ ' + t.note : 'Not in your data. ' + t.note}`),
    '', '## Roadmap',
    ...roadmap.map((p) => `- **${p.when} (${p.title}):** ${p.items.length ? p.items.join(' ') : 'Nothing urgent in this phase.'}`),
  ].join('\n');
  return { markdown: md, topFindings: top, recommendations: recs.slice(0, 3), scenario: sc, topics, roadmap };
}

export function documentation(ds: Dataset, findings: Finding[], methods: string[] = []) {
  const p = profileData(ds), fm = detectFields(ds);
  return [
    `# Analysis documentation: ${ds.name}`, `Source: ${ds.source}. ${ds.label}.`, '',
    '## Dataset', `${p.rowCount} rows, ${p.columns.length} columns.`,
    '| Column | Type | Nulls | Distinct |', '|---|---|---|---|',
    ...p.columns.map((c) => `| ${c.name} | ${c.type} | ${c.nullPct}% | ${c.distinct} |`),
    '', '## Metrics', `Measure: ${fm.measure}. Profit: ${fm.profit ?? 'none'}. Date: ${fm.date ?? 'none'}. Dimensions: ${fm.dims.join(', ')}.`,
    '', '## Methods', ...(methods.length ? methods : ['Pareto concentration and HHI', 'Segment margin and 6-month trend comparison', 'IQR outliers (1.5x)', 'Pearson correlation', 'Scenario formulas are explicit and editable']).map((m) => `- ${m}`),
    '', '## Assumptions', '- Trend windows are 183 days ending at the latest date in the data.', '- Recovery rates in recommendations are hypothetical.',
    '', '## Findings', ...findings.map((f) => `- [${f.severity}] ${f.title}. ${f.explanation}`),
  ].join('\n');
}
