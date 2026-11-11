import type { Finding } from './types';
import { round } from './stats';

const PLAYBOOK: Record<
  Finding['category'],
  { intervention: string; recovery: number; effort: 'low' | 'medium' | 'high'; risks: string }
> = {
  profitability: {
    intervention: 'Reprice or cap discounts on the loss-making segment; renegotiate supplier cost.',
    recovery: 0.6,
    effort: 'low',
    risks: 'Some volume loss from higher prices.',
  },
  pricing: {
    intervention: 'Discount approval tiers with margin floor and monthly review.',
    recovery: 0.3,
    effort: 'low',
    risks: 'Sales-team pushback; slower deal closing.',
  },
  concentration: {
    intervention: 'Account-diversification program plus retention plan for the top accounts.',
    recovery: 0.15,
    effort: 'high',
    risks: 'Takes quarters to move the mix; distracts from core sales.',
  },
  trend: {
    intervention: 'Root-cause the decline and run a regional recovery pilot.',
    recovery: 0.4,
    effort: 'medium',
    risks: 'Cause may be structural (market shift), capping recovery.',
  },
  outlier: {
    intervention: 'Audit the largest orders for duplicates or entry errors.',
    recovery: 0,
    effort: 'low',
    risks: 'Low; mostly validation time.',
  },
  'data-quality': {
    intervention: 'Fix source feed and add validation at entry.',
    recovery: 0,
    effort: 'medium',
    risks: 'Needs IT time.',
  },
  returns: {
    intervention:
      'Fix the top returned products (quality, photos, sizing, descriptions) and tighten cancellation terms.',
    recovery: 0.25,
    effort: 'medium',
    risks: 'Stricter policies can lower conversion.',
  },
  retention: {
    intervention:
      'Win-back outreach to lapsed best customers plus a post-purchase email flow for new buyers.',
    recovery: 0.2,
    effort: 'low',
    risks: 'Discount-led win-backs can train customers to wait for offers.',
  },
  product: {
    intervention:
      'Restock or relist products that stopped selling; retire true losers on purpose, not by accident.',
    recovery: 0.3,
    effort: 'low',
    risks: 'Some may have been discontinued for a reason.',
  },
  seasonality: {
    intervention: 'Plan stock and cash for the peak; run off-season campaigns to smooth revenue.',
    recovery: 0,
    effort: 'medium',
    risks: 'Off-season promotions can cut margin.',
  },
  anomaly: {
    intervention:
      'Investigate the segment that is falling behind the rest of the business and run a targeted recovery test.',
    recovery: 0.4,
    effort: 'medium',
    risks: 'The cause may be outside your control (market, competitor).',
  },
};
const COST = { low: 1, medium: 2, high: 3 } as const;

export function recommend(findings: Finding[]) {
  // One row per action. When several findings call for the same action their estimates are NOT added: they can
  // describe the same sales (e.g. customer and product concentration over the same orders) or cover different
  // periods. The row carries the largest single estimate (with its own period and assumption) and lists every
  // contributing estimate in `parts`, so nothing is double-counted.
  const rows = recommendEach(findings),
    byAction = new Map<string, Rec>();
  for (const r of rows) {
    const part = {
      findingId: r.findingId,
      problem: r.problem,
      benefit: r.expectedBenefitUsd,
      period: r.benefitPeriod ?? null,
      recoveryPct: r.recoveryPct,
    };
    const prev = byAction.get(r.intervention);
    if (!prev) {
      byAction.set(r.intervention, { ...r, findingIds: [r.findingId], parts: [part] });
      continue;
    }
    const parts = [...prev.parts, part];
    const best = parts.filter((p) => p.benefit !== null).sort((a, b) => b.benefit! - a.benefit!)[0];
    const counted = parts.filter((p) => p.benefit !== null).length;
    const lead = best ? rows.find((x) => x.findingId === best.findingId)! : prev;
    byAction.set(r.intervention, {
      ...prev,
      findingIds: parts.map((p) => p.findingId),
      parts,
      problem: parts.map((p) => p.problem).join('; '),
      expectedBenefitUsd: best?.benefit ?? null,
      benefitPeriod: best?.period ?? prev.benefitPeriod,
      recoveryPct: best?.recoveryPct ?? null,
      benefitBasis: best
        ? `${lead.benefitBasis}${counted > 1 ? `. Largest of ${counted} estimates for this action; they are not added because they may cover the same sales or different periods` : ''}`
        : prev.benefitBasis,
      benefitToEffort: best ? round(best.benefit! / COST[r.effort] ** 2, 0) : null,
    });
  }
  return [...byAction.values()].sort((a, b) => (b.benefitToEffort ?? -1) - (a.benefitToEffort ?? -1));
}

type Part = {
  findingId: string;
  problem: string;
  benefit: number | null;
  period: string | null;
  recoveryPct: number | null;
};
type Rec = ReturnType<typeof recommendEach>[number] & { parts: Part[] };

function recommendEach(findings: Finding[]) {
  // Unconfirmed signals ("Possible: …") are for watching, not for acting on or putting a money figure on.
  return findings
    .filter((f) => !f.id.startsWith('watch-'))
    .map((f) => {
      const p = PLAYBOOK[f.category];
      // Reversed or untracked sales were never lost, so there's nothing to "recover".
      const recoverable = f.exposure !== 'reversed' && f.exposure !== 'untracked';
      const benefit = f.impactUsd && recoverable && p.recovery > 0 ? round(f.impactUsd * p.recovery) : null;
      return {
        findingId: f.id,
        problem: f.title,
        intervention: p.intervention,
        expectedBenefitUsd: benefit,
        /** Profitability fixes recover profit; concentration/trend/outlier benefits are revenue protected or recovered. */
        benefitKind:
          f.category === 'profitability' || f.category === 'pricing'
            ? ('profit' as const)
            : ('revenue' as const),
        benefitBasis:
          benefit === null
            ? recoverable
              ? 'No money figure to recover from this data'
              : 'Nothing to recover: this money was never earned or lost'
            : `${Math.round(p.recovery * 100)}% of it is won back (${f.impactBasis?.replace(/\.$/, '')}; a planning assumption, not a measured result)`,
        /** The planning assumption behind the benefit (share recovered) and the period the money covers. */
        recoveryPct: benefit === null ? null : Math.round(p.recovery * 100),
        benefitPeriod: f.period,
        findingIds: undefined as string[] | undefined,
        effort: p.effort,
        risks: p.risks,
        evidence: f.evidence,
        severity: f.severity,
        /** A ranking score (scenario benefit ÷ effort weight), not a return on investment: real costs aren't in the data. */
        benefitToEffort: benefit === null ? null : round(benefit / COST[p.effort] ** 2, 0),
      };
    });
}
