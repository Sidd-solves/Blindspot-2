import type { Finding } from './types';
import { round } from './stats';

const PLAYBOOK: Record<Finding['category'], { intervention: string; recovery: number; effort: 'low' | 'medium' | 'high'; risks: string }> = {
  profitability: { intervention: 'Reprice or cap discounts on the loss-making segment; renegotiate supplier cost.', recovery: 0.6, effort: 'low', risks: 'Some volume loss from higher prices.' },
  pricing: { intervention: 'Discount approval tiers with margin floor and monthly review.', recovery: 0.3, effort: 'low', risks: 'Sales-team pushback; slower deal closing.' },
  concentration: { intervention: 'Account-diversification program plus retention plan for the top accounts.', recovery: 0.15, effort: 'high', risks: 'Takes quarters to move the mix; distracts from core sales.' },
  trend: { intervention: 'Root-cause the decline and run a regional recovery pilot.', recovery: 0.4, effort: 'medium', risks: 'Cause may be structural (market shift), capping recovery.' },
  outlier: { intervention: 'Audit the largest orders for duplicates or entry errors.', recovery: 0, effort: 'low', risks: 'Low; mostly validation time.' },
  'data-quality': { intervention: 'Fix source feed and add validation at entry.', recovery: 0, effort: 'medium', risks: 'Needs IT time.' },
};
const COST = { low: 1, medium: 2, high: 3 } as const;

export function recommend(findings: Finding[]) {
  return findings.map((f) => {
    const p = PLAYBOOK[f.category];
    const benefit = f.impactUsd ? round(f.impactUsd * p.recovery) : null;
    return {
      findingId: f.id, problem: f.title, intervention: p.intervention,
      expectedBenefitUsd: benefit,
      /** Profitability fixes recover profit; concentration/trend/outlier benefits are revenue protected or recovered. */
      benefitKind: f.category === 'profitability' || f.category === 'pricing' ? ('profit' as const) : ('revenue' as const),
      benefitBasis: benefit === null ? 'Not quantifiable from loaded data' : `Hypothetical: ${Math.round(p.recovery * 100)}% recovery of the ${f.impactBasis?.toLowerCase()}`,
      effort: p.effort, risks: p.risks, evidence: f.evidence, severity: f.severity,
      benefitToEffort: benefit === null ? null : round(benefit / COST[p.effort] ** 2, 0),
    };
  }).sort((a, b) => (b.benefitToEffort ?? -1) - (a.benefitToEffort ?? -1));
}
