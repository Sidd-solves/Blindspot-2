import type { Dataset, Finding } from './types';
import { detectFields, profileData } from './profile';
import { recommend } from './recommend';
import { simulateScenario } from './scenario';
import { numeric } from './profile';
import { sum } from './stats';

const usd = (n: number | null) => (n === null ? 'n/a' : '$' + Math.round(n).toLocaleString('en-US'));

export const baselineOf = (ds: Dataset) => {
  const fm = detectFields(ds);
  return { revenue: sum(numeric(ds.rows, fm.measure)), profit: fm.profit ? sum(numeric(ds.rows, fm.profit)) : 0 };
};

export function toStory(f: Finding) {
  return {
    problem: f.title, evidence: f.explanation,
    businessImpact: f.impactUsd !== null ? `${usd(f.impactUsd)}: ${f.impactBasis}.` : 'Not quantifiable from the loaded data.',
    recommendation: f.nextAction,
  };
}

export function executiveSummary(ds: Dataset, findings: Finding[]) {
  const base = baselineOf(ds);
  const recs = recommend(findings.slice(0, 6));
  const top = findings.slice(0, 3);
  const sc = simulateScenario(base, { churnReductionPct: 5, opexReductionPct: 8 });
  const md = [
    `# Executive Summary: ${ds.name}`,
    `> Data: ${ds.label}. Figures are computed from ${ds.rows.length.toLocaleString()} rows; scenarios are hypothetical.`,
    '', `**Revenue** ${usd(base.revenue)} | **Profit** ${usd(base.profit)} | **Margin** ${base.revenue ? ((base.profit / base.revenue) * 100).toFixed(1) : '0'}%`,
    '', '## Top 3 findings',
    ...top.map((f, i) => `${i + 1}. **${f.title}** [${f.severity}, confidence ${Math.round(f.confidence * 100)}%]. ${f.explanation}`),
    '', '## Priority recommendations',
    ...recs.slice(0, 3).map((r, i) => `${i + 1}. ${r.intervention} (effort: ${r.effort}; expected ${r.benefitKind} benefit: ${usd(r.expectedBenefitUsd)}; ${r.benefitBasis}).`),
    '', '## Financial assumptions',
    `Illustrative scenario (churn -5%, opex -8%) yields **+${usd(sc.delta.profit)}** profit using: ` + sc.formulas.join('; ') + '.',
    '', '## Roadmap',
    '- **0-30 days:** fix loss-making pricing, validate outlier data.',
    '- **30-90 days:** regional recovery pilot, discount approval tiers.',
    '- **90-180 days:** account diversification program, re-measure.',
  ].join('\n');
  return { markdown: md, topFindings: top, recommendations: recs.slice(0, 3), scenario: sc };
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
