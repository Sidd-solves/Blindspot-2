import { round } from './stats';

export interface ScenarioBaseline { revenue: number; profit: number | null; years?: number; basis?: 'average' | 'run-rate' | 'observed'; period?: string }
export interface ScenarioAssumptions {
  annualChurnRate: number;     // share of revenue lost to churn per year (hypothetical)
  baselineConversion: number;  // visitor->order conversion (hypothetical)
  wasteRateOfCogs: number;     // share of COGS lost to waste (hypothetical)
  opexRateOfRevenue: number;   // operating expense as share of revenue (hypothetical)
  /** Gross margin to assume when the data has no profit column (an editable assumption, never presented as measured). */
  assumedMargin: number;
}
export interface ScenarioLevers {
  churnReductionPct: number;      // relative reduction in churn, e.g. 5 = churn falls 5%
  conversionLiftPts: number;      // percentage-point lift in conversion
  wasteReductionPct: number;      // relative reduction in waste
  opexReductionPct: number;       // relative reduction in opex
}
export const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = { annualChurnRate: 0.2, baselineConversion: 0.03, wasteRateOfCogs: 0.04, opexRateOfRevenue: 0.12, assumedMargin: 0.35 };

export function simulateScenario(base: ScenarioBaseline, levers: Partial<ScenarioLevers>, a: Partial<ScenarioAssumptions> = {}) {
  const as = { ...DEFAULT_ASSUMPTIONS, ...a };
  const l = { churnReductionPct: 0, conversionLiftPts: 0, wasteReductionPct: 0, opexReductionPct: 0, ...levers };
  const profitKnown = base.profit !== null;
  const margin = profitKnown ? (base.revenue ? base.profit! / base.revenue : 0) : as.assumedMargin;
  const baseProfit = profitKnown ? base.profit! : base.revenue * margin;
  const cogs = base.revenue - baseProfit;
  // Churn is an annual rate. When the baseline is a short observed period (not annualised), convert it to that
  // period: churn over h years = 1 − (1 − annual)^h. Other levers scale with revenue or cost of the same period.
  const horizon = base.basis === 'observed' ? Math.min(1, Math.max(0, base.years ?? 1)) : 1;
  const periodChurn = horizon === 1 ? as.annualChurnRate : 1 - Math.pow(1 - as.annualChurnRate, horizon);
  const churnRevenue = base.revenue * periodChurn * (l.churnReductionPct / 100);
  const convRevenue = base.revenue * (l.conversionLiftPts / 100 / as.baselineConversion);
  const wasteSaving = cogs * as.wasteRateOfCogs * (l.wasteReductionPct / 100);
  const opexSaving = base.revenue * as.opexRateOfRevenue * (l.opexReductionPct / 100);
  const revenueDelta = churnRevenue + convRevenue;
  const profitDelta = revenueDelta * margin + wasteSaving + opexSaving;
  const grossDelta = revenueDelta * margin + wasteSaving;
  const rev = base.revenue + revenueDelta, gross = baseProfit + grossDelta, prof = baseProfit + profitDelta;
  const per = base.basis === 'observed' ? (base.period ?? 'over the file') : 'per year';
  return {
    hypothetical: true as const,
    horizonYears: round(horizon, 4),
    baseline: { revenue: round(base.revenue), profit: round(baseProfit), margin: round(margin, 4), profitKnown, years: round(base.years ?? 1, 2), basis: base.basis ?? 'average', period: base.period ?? 'per year' },
    /** Percent change is only meaningful against a measured, positive profit baseline. */
    profitChangePct: profitKnown && baseProfit > 0 ? round(profitDelta / baseProfit, 4) : null,
    assumptions: as, levers: l,
    contributions: { churn: round(churnRevenue * margin), conversion: round(convRevenue * margin), waste: round(wasteSaving), opex: round(opexSaving) },
    /** grossProfit and margin exclude running costs; profit = gross profit + running-cost savings. */
    scenario: { revenue: round(rev), grossProfit: round(gross), profit: round(prof), margin: round(rev ? gross / rev : 0, 4) },
    delta: { revenue: round(revenueDelta), grossProfit: round(grossDelta), opexSaving: round(opexSaving), profit: round(profitDelta) },
    formulas: [
      horizon === 1 ? 'churn revenue = revenue x churnRate x churnReduction%; profit = x baseline margin' : `churn revenue = revenue x periodChurn x churnReduction%, where periodChurn = 1 − (1 − ${as.annualChurnRate})^${round(horizon, 3)} years = ${round(periodChurn, 4)}; profit = x baseline margin`,
      'conversion revenue = revenue x (liftPts / baselineConversion); profit = x baseline margin',
      'waste saving = COGS x wasteRate x wasteReduction%',
      'opex saving = revenue x opexRate x opexReduction%',
      'gross profit = sales minus product cost; margin shown is gross margin; extra profit = extra gross profit + running-cost savings',
    ],
    disclaimer: profitKnown ? `Hypothetical what-if, ${per}. Rates are editable assumptions, not measured company figures.${base.basis === 'run-rate' ? ` Baseline is a run rate from ${base.period?.match(/[\d.]+ months/)?.[0] ?? 'part of a year'}, not seasonally adjusted.` : ''}` : `Hypothetical what-if, ${per}.${base.basis === 'run-rate' ? ' Baseline is a run rate from part of a year, not seasonally adjusted.' : ''} Your data has no profit or cost column, so a ${Math.round(as.assumedMargin * 100)}% gross margin is assumed; add a costs file for real margins.`,
  };
}
