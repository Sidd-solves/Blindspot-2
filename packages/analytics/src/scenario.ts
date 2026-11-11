import { round } from './stats';

export interface ScenarioBaseline { revenue: number; profit: number; }
export interface ScenarioAssumptions {
  annualChurnRate: number;     // share of revenue lost to churn per year (hypothetical)
  baselineConversion: number;  // visitor->order conversion (hypothetical)
  wasteRateOfCogs: number;     // share of COGS lost to waste (hypothetical)
  opexRateOfRevenue: number;   // operating expense as share of revenue (hypothetical)
}
export interface ScenarioLevers {
  churnReductionPct: number;      // relative reduction in churn, e.g. 5 = churn falls 5%
  conversionLiftPts: number;      // percentage-point lift in conversion
  wasteReductionPct: number;      // relative reduction in waste
  opexReductionPct: number;       // relative reduction in opex
}
export const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = { annualChurnRate: 0.2, baselineConversion: 0.03, wasteRateOfCogs: 0.04, opexRateOfRevenue: 0.12 };

export function simulateScenario(base: ScenarioBaseline, levers: Partial<ScenarioLevers>, a: Partial<ScenarioAssumptions> = {}) {
  const as = { ...DEFAULT_ASSUMPTIONS, ...a };
  const l = { churnReductionPct: 0, conversionLiftPts: 0, wasteReductionPct: 0, opexReductionPct: 0, ...levers };
  const margin = base.revenue ? base.profit / base.revenue : 0;
  const cogs = base.revenue - base.profit;
  const churnRevenue = base.revenue * as.annualChurnRate * (l.churnReductionPct / 100);
  const convRevenue = base.revenue * (l.conversionLiftPts / 100 / as.baselineConversion);
  const wasteSaving = cogs * as.wasteRateOfCogs * (l.wasteReductionPct / 100);
  const opexSaving = base.revenue * as.opexRateOfRevenue * (l.opexReductionPct / 100);
  const revenueDelta = churnRevenue + convRevenue;
  const profitDelta = revenueDelta * margin + wasteSaving + opexSaving;
  const rev = base.revenue + revenueDelta, prof = base.profit + profitDelta;
  return {
    hypothetical: true as const,
    baseline: { revenue: round(base.revenue), profit: round(base.profit), margin: round(margin, 4) },
    assumptions: as, levers: l,
    contributions: { churn: round(churnRevenue * margin), conversion: round(convRevenue * margin), waste: round(wasteSaving), opex: round(opexSaving) },
    scenario: { revenue: round(rev), profit: round(prof), margin: round(rev ? prof / rev : 0, 4) },
    delta: { revenue: round(revenueDelta), profit: round(profitDelta) },
    formulas: [
      'churn revenue = revenue x churnRate x churnReduction%; profit = x baseline margin',
      'conversion revenue = revenue x (liftPts / baselineConversion); profit = x baseline margin',
      'waste saving = COGS x wasteRate x wasteReduction%',
      'opex saving = revenue x opexRate x opexReduction%',
    ],
    disclaimer: 'Hypothetical what-if. Rates are editable assumptions, not measured company figures.',
  };
}
