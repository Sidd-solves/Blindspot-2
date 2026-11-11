import type { CheckRun, Dataset, Finding } from './types';
import { detectFields, profileData } from './profile';
import { recommend } from './recommend';
import { checkRuns } from './findings';
import { simulateScenario } from './scenario';
import { numeric } from './profile';
import { sum } from './stats';

import { money } from './money';
import { forecastSales } from './forecast';
import { describeAccuracy } from './accuracy';

/**
 * Yearly baseline for the simulator. Profit stays null when the data has no profit column (unknown is not zero).
 * - a year or more of data: yearly average over the loaded range ("average")
 * - 1 to 12 months: a run rate, total / years, not seasonally adjusted ("run-rate")
 * - under 30 days: too short to annualize; the observed total is returned and labeled as such ("observed")
 */
export const baselineOf = (ds: Dataset) => {
  const fm = detectFields(ds);
  const rows = 'IsReturn' in (ds.rows[0] ?? {}) ? ds.rows.filter((r) => r.IsReturn !== 1) : ds.rows;
  let years: number | null = null;
  if (fm.date) {
    let lo = Infinity,
      hi = -Infinity;
    for (const r of ds.rows) {
      const t = Date.parse(String(r[fm.date]));
      if (Number.isFinite(t)) {
        if (t < lo) lo = t;
        if (t > hi) hi = t;
      }
    }
    if (Number.isFinite(lo) && hi >= lo) years = (hi - lo + 86400000) / (365.25 * 86400000);
  }
  const basis: 'average' | 'run-rate' | 'observed' =
    years === null || years < 30 / 365.25 ? 'observed' : years >= 1 ? 'average' : 'run-rate';
  const div = basis === 'observed' ? 1 : years!;
  const months = years === null ? null : Math.round(years * 12 * 10) / 10;
  const revenue = sum(numeric(rows, fm.measure)) / div,
    profit = fm.profit ? sum(numeric(rows, fm.profit)) / div : null;
  const period =
    basis === 'average'
      ? 'per year'
      : basis === 'run-rate'
        ? `per year (run rate from ${months} months of data, not seasonally adjusted)`
        : years === null
          ? 'over the file (no dates, so not annualized)'
          : `over the ${Math.round(years * 365.25)} days in your file (too short to annualize)`;
  return { revenue, profit, years: years ?? 1, basis, months, period };
};

export function toStory(f: Finding, currency = 'USD') {
  const usd = (n: number | null) => money(n, currency);
  return {
    problem: f.title,
    evidence: f.explanation,
    businessImpact:
      f.impactUsd !== null
        ? `${usd(f.impactUsd)}: ${f.impactBasis}.`
        : 'Not quantifiable from the loaded data.',
    recommendation: f.nextAction,
  };
}

/** The fixed report template: every topic always appears, with what was found or why it couldn't be checked. */
const GEO_ID = /^conc-(country|region|state|province|city|market)/i;
const GEO_ID_COL = /^(country|region|state|province|city|market)/i;
export const REPORT_TOPICS = [
  { key: 'customers', label: 'Customer and product dependence', cats: ['concentration'] },
  { key: 'markets', label: 'Market reach', cats: ['concentration'] },
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
  const fm = detectFields(ds),
    rows = ds.rows;
  const tx = rows.length > 0 && 'Order' in rows[0] && 'Customer' in rows[0];
  const hasReturns = rows.length > 0 && 'IsReturn' in rows[0];
  let months = 0;
  if (fm.date) {
    let mn = Infinity,
      mx = -Infinity;
    for (const r of rows) {
      const t = Date.parse(String(r[fm.date]).slice(0, 10));
      if (t < mn) mn = t;
      if (t > mx) mx = t;
    }
    months = (mx - mn) / (30.4 * 86400000);
  }
  // Some checks only run with enough data; say so instead of reporting "no problem found".
  const cols = Object.keys(rows[0] ?? {});
  const UNKNOWN_VALUES = new Set([
    'Unknown',
    'Unknown customer',
    'Guest checkout',
    'Unspecified',
    '(none)',
    'N/A',
    'n/a',
    '-',
  ]);
  // Which dependence checks actually ran: concentration runs on non-ID, non-geography high-cardinality columns
  // (see findings.ts). Customer and product coverage are evaluated separately; order IDs never count.
  const ranDims = new Set(
    fm.highCardDims.filter((d) => !/^(order|invoice|transaction)/i.test(d) && !GEO_ID_COL.test(d)),
  );
  const distinct = (col: string) =>
    new Set(rows.map((r) => String(r[col] ?? '')).filter((v) => v && !UNKNOWN_VALUES.has(v))).size;
  const depCols = [
    cols.find((k) => /customer|client|buyer/i.test(k)),
    cols.find((k) => /^(product|item|sku|title|description)/i.test(k) || /product/i.test(k)),
  ].filter((c): c is string => !!c);
  const dependence = {
    ran: depCols.filter((c) => ranDims.has(c)),
    notRun: depCols
      .filter((c) => !ranDims.has(c))
      .map((c) => {
        const n = distinct(c);
        return {
          col: c,
          why: `only ${n} distinct ${c.toLowerCase()} value${n === 1 ? '' : 's'}, too few to measure dependence`,
        };
      }),
  };
  const orderCount = tx ? new Set(rows.filter((r) => r.IsReturn !== 1).map((r) => String(r.Order))).size : 0;
  /** Note shown when a topic was checked and nothing was found, naming any part that was not judged. */
  const checkedNote: Record<string, string | null> = {
    customers:
      dependence.ran.length && dependence.notRun.length
        ? `Checked ${dependence.ran.map((c) => c.toLowerCase()).join(' and ')}: no problem found. ${dependence.notRun.map((x) => `${x.col}: not judged (${x.why})`).join('; ')}.`
        : null,
  };
  let knownCustomers = 0;
  if (tx) {
    const s = new Set<string>();
    for (const r of rows)
      if (r.IsReturn !== 1 && !['Unknown customer', 'Guest checkout', ''].includes(String(r.Customer)))
        s.add(String(r.Customer));
    knownCustomers = s.size;
  }
  const thin: Record<string, string | null> = {
    customers: dependence.ran.length
      ? null
      : dependence.notRun.length
        ? `Not judged: ${dependence.notRun.map((x) => x.why).join('; ')}.`
        : null,
    orders:
      tx && orderCount < 200
        ? `Not judged: only ${orderCount.toLocaleString()} orders; the large-order check needs 200+.`
        : null,
    markets: (() => {
      const col = cols.find((k) => /country|region|state|province|market/i.test(k));
      if (!col) return null;
      const n = new Set(rows.map((r) => String(r[col] ?? '')).filter((v) => v && !UNKNOWN_VALUES.has(v)))
        .size;
      return n <= 1
        ? n === 0
          ? `The ${col} column is empty or only placeholders.`
          : `Not judged: every sale is in one ${col.toLowerCase()}.`
        : null;
    })(),
    retention:
      tx && knownCustomers < 100
        ? `Checked, but only ${knownCustomers} known customers; repeat-buyer tests need 100+.`
        : null,
    trend:
      fm.date && months >= 6 && months < 15
        ? 'Checked against the previous period only; year-over-year needs 15+ months.'
        : null,
  };
  const missing: Record<string, string | null> = {
    customers: depCols.length ? null : 'Needs a customer or product column.',
    markets: cols.some((k) => /country|region|state|province|city|market/i.test(k))
      ? null
      : 'Needs a country or region column.',
    profit: fm.profit ? null : 'Needs a profit or product-cost column.',
    trend: fm.date
      ? months >= 6
        ? null
        : 'Needs at least 6 months of dated sales.'
      : 'Needs a date column.',
    retention: tx && fm.date ? null : 'Needs customer IDs and order IDs.',
    returns: hasReturns ? null : 'Needs returns or cancellations in the data.',
    products: tx && months >= 15 ? null : 'Needs order lines with products and 15+ months of history.',
    seasonality: fm.date && months >= 12 ? null : 'Needs at least 12 months of dated sales.',
    orders: tx ? null : 'Needs order IDs.',
    data: null,
  };
  // Execution records come from the checks themselves (see checkRuns): what ran, what didn't, and why.
  type Check = CheckRun;
  const runs = checkRuns(ds);
  const CHECKS: Record<string, Check[]> = {};
  for (const r of runs) (CHECKS[r.topic] ??= []).push(r);
  return REPORT_TOPICS.map((t) => {
    const hits = findings.filter(
      (f) =>
        (t.cats as readonly string[]).includes(f.category) &&
        (t.key === 'markets' ? GEO_ID.test(f.id) : t.key === 'customers' ? !GEO_ID.test(f.id) : true),
    );
    // Unconfirmed signals ("Possible: …") count as something to watch, not a confirmed problem.
    const confirmed = hits.filter((f) => !f.id.startsWith('watch-'));
    const checks = CHECKS[t.key] ?? [],
      ran = checks.filter((c) => c.ran),
      skipped = checks.filter((c) => !c.ran);
    // A topic with no recorded checks was not applicable to this file at all.
    const eligible = checks.length ? checks.some((c) => c.eligible) : !missing[t.key];
    const coverage: 'full' | 'partial' | 'none' =
      !checks.length || skipped.length === 0 ? 'full' : ran.length ? 'partial' : 'none';
    const status = confirmed.length
      ? 'issue'
      : hits.length
        ? 'watch'
        : !eligible
          ? 'not-in-data'
          : coverage === 'none'
            ? 'not-enough'
            : coverage === 'partial'
              ? 'partial'
              : 'clear';
    const note = hits.length
      ? hits[0].title
      : !eligible
        ? (missing[t.key] ?? skipped[0]?.reason ?? 'Not in your data.')
        : coverage === 'none'
          ? skipped
              .map((c) => (c.reason ?? '').replace(/^only/, 'Not judged: only'))
              .filter(Boolean)
              .join(' ') ||
            thin[t.key] ||
            'Not enough data to check.'
          : coverage === 'partial'
            ? `Checked ${ran.map((c) => c.label.toLowerCase()).join(' and ')}: no problem found. Not run: ${skipped.map((c) => `${c.label.toLowerCase()} (${(c.reason ?? '').replace(/\.$/, '').replace(/^Not judged: /, '')})`).join('; ')}.`
            : (checkedNote[t.key] ?? 'Checked: no problem found.');
    return {
      key: t.key,
      label: t.label,
      status,
      note,
      check: { eligible, ran: coverage !== 'none' && eligible, coverage, checks },
      count: hits.length,
      severity: hits[0]?.severity ?? null,
    };
  });
}

export function roadmapFrom(recs: ReturnType<typeof recommend>) {
  // One line per distinct action, even when several findings call for it.
  const phase = (effort: string) => [
    ...new Set(recs.filter((r) => r.effort === effort).map((r) => r.intervention)),
  ];
  return [
    { when: '0–30 days', title: 'Quick wins', items: phase('low') },
    { when: '30–90 days', title: 'Bigger fixes', items: phase('medium') },
    { when: '90–180 days', title: 'Long-term', items: phase('high') },
  ];
}

export function executiveSummary(ds: Dataset, findings: Finding[]) {
  const usd = (n: number | null) => money(n, ds.currency);
  const base = baselineOf(ds);
  // One recommendation per distinct action (several findings can share a fix).
  // All findings, not just the first few: an action tied to a lower-ranked finding can still be the best value.
  const recs = recommend(findings).filter(
    (r, i, a) => a.findIndex((x) => x.intervention === r.intervention) === i,
  );
  const topics = reportTopics(ds, findings),
    roadmap = roadmapFrom(recs);
  const top = findings.slice(0, 3);
  const sc = simulateScenario(base, { churnReductionPct: 5, opexReductionPct: 8 });
  const fm = detectFields(ds);
  const fc = forecastSales(ds.rows, fm.date, fm.measure, { horizon: 3 });
  const monthLabel = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const md = [
    `# Executive Summary: ${ds.name}`,
    `> Data: ${ds.label}. Figures are computed from ${ds.rows.length.toLocaleString()} rows; scenarios are hypothetical.`,
    '',
    `**Revenue ${base.period}** ${usd(base.revenue)} | **Profit** ${base.profit === null ? 'not in your data (no cost or profit column)' : `${usd(base.profit)} ${base.basis === 'observed' ? 'in total' : 'per year'} | **Margin** ${base.revenue ? ((base.profit / base.revenue) * 100).toFixed(1) : '0'}%`}`,
    '',
    '## Top 3 findings',
    ...top.map(
      (f, i) =>
        `${i + 1}. **${f.title}** [${f.severity}; ${f.basis === 'tested' && f.pValue !== null ? `statistically tested, ${f.pKind === 'q' ? 'BH-adjusted q' : 'p'} ${f.pValue < 0.001 ? '< 0.001' : `= ${f.pValue.toFixed(3)}`}` : f.basis === 'measured' ? 'measured' : 'rule of thumb'}${f.period ? `; ${f.period}` : ''}]. ${f.explanation}`,
    ),
    '',
    '## Priority recommendations',
    ...recs
      .slice(0, 3)
      .map(
        (r, i) =>
          `${i + 1}. ${r.intervention} (effort: ${r.effort}; ${r.expectedBenefitUsd !== null ? `scenario: ${usd(r.expectedBenefitUsd)} ${r.benefitKind} if ${r.benefitBasis}` : r.benefitBasis}).`,
      ),
    '',
    `## Financial assumptions (illustrative, ${base.basis === 'observed' ? 'over the file' : 'per year'})`,
    `Scenario (keep 5% more customers, cut running costs 8%) adds **${usd(sc.delta.profit)}** profit ${base.basis === 'observed' ? 'over the same period' : 'per year'} (gross profit plus running-cost savings). ${sc.disclaimer} Formulas: ` +
      sc.formulas.join('; ') +
      '.',
    '',
    '## Sales forecast (next 3 months)',
    ...(fc.ok
      ? [
          fc.forecast
            .map(
              (x) =>
                `- **${monthLabel(x.month)}:** ${usd(x.value)}${x.low !== null && x.high !== null ? ` (nominal 80% range ${usd(x.low)} to ${usd(x.high)})` : ''}`,
            )
            .join('\n'),
          `Method: ${fc.method!.label.toLowerCase()}. Track record: replayed on the last ${fc.accuracy.months} months using only the data available at the time, it was ${describeAccuracy(fc.accuracy, usd).sentence}${fc.accuracy.rangeTested ? `, and ${Math.round((fc.accuracy.hitRate ?? 0) * fc.accuracy.rangeTested)} of ${fc.accuracy.rangeTested} months landed inside its nominal 80% range (limited calibration evidence)` : ''}. A forecast assumes the coming months behave like the past ones.`,
        ]
      : [`Not shown: ${fc.reason}`]),
    '',
    '## Every topic checked',
    ...topics.map(
      (t) =>
        `- **${t.label}:** ${t.status === 'issue' ? '⚠ ' + t.note : t.status === 'watch' ? 'Worth watching (not confirmed). ' + t.note : t.status === 'partial' ? 'Partly checked. ' + t.note : t.status === 'clear' ? '✓ ' + t.note : t.status === 'not-enough' ? 'Not enough data. ' + t.note : 'Not in your data. ' + t.note}`,
    ),
    '',
    '## Roadmap',
    ...roadmap.map(
      (p) =>
        `- **${p.when} (${p.title}):** ${p.items.length ? p.items.join(' ') : 'Nothing urgent in this phase.'}`,
    ),
  ].join('\n');
  return {
    markdown: md,
    topFindings: top,
    recommendations: recs.slice(0, 3),
    scenario: sc,
    topics,
    roadmap,
    forecast: fc,
  };
}

export function documentation(ds: Dataset, findings: Finding[], methods: string[] = []) {
  const p = profileData(ds),
    fm = detectFields(ds);
  return [
    `# Analysis documentation: ${ds.name}`,
    `Source: ${ds.source}. ${ds.label}.`,
    '',
    '## Dataset',
    `${p.rowCount} rows, ${p.columns.length} columns.`,
    '| Column | Type | Nulls | Distinct |',
    '|---|---|---|---|',
    ...p.columns.map((c) => `| ${c.name} | ${c.type} | ${c.nullPct}% | ${c.distinct} |`),
    '',
    '## Metrics',
    `Measure: ${fm.measure}. Profit: ${fm.profit ?? 'none'}. Date: ${fm.date ?? 'none'}. Dimensions: ${fm.dims.join(', ')}.`,
    '',
    '## Methods',
    ...(methods.length
      ? methods
      : [
          'Pareto concentration and HHI',
          'Segment margin and 6-month trend comparison',
          'IQR outliers (1.5x)',
          'Pearson correlation',
          'Scenario formulas are explicit and editable',
        ]
    ).map((m) => `- ${m}`),
    '',
    '## Assumptions',
    '- Trend windows are 183 days ending at the latest date in the data.',
    '- Recovery rates in recommendations are hypothetical.',
    '',
    '## Findings',
    ...findings.map((f) => `- [${f.severity}] ${f.title}. ${f.explanation}`),
  ].join('\n');
}
