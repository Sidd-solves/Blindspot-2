import { z } from 'zod';
import { analyzeSmart, recommend, simulateScenario, executiveSummary, baselineOf, auditDashboard, analyzeColors } from '@blindspot/analytics';
import { defineTool } from '../core';
import { DashboardSpecSchema } from './design';

export const runScenario = defineTool({
  name: 'run-scenario', category: 'Business Intelligence', core: false,
  description: 'Financial impact simulator: churn, conversion, waste and opex levers with explicit, editable assumptions. Output is hypothetical.',
  input: z.object({
    levers: z.object({ churnReductionPct: z.number().min(0).max(100).default(5), conversionLiftPts: z.number().min(0).max(20).default(0), wasteReductionPct: z.number().min(0).max(100).default(0), opexReductionPct: z.number().min(0).max(100).default(0) }).default({}),
    assumptions: z.object({ annualChurnRate: z.number().min(0).max(1), baselineConversion: z.number().min(0.0001).max(1), wasteRateOfCogs: z.number().min(0).max(1), opexRateOfRevenue: z.number().min(0).max(1) }).partial().default({}),
  }),
  output: z.object({ hypothetical: z.literal(true), baseline: z.record(z.number()), scenario: z.record(z.number()), delta: z.record(z.number()), contributions: z.record(z.number()), assumptions: z.record(z.number()), levers: z.record(z.number()), formulas: z.array(z.string()), disclaimer: z.string() }),
  async handler(ctx, i) { return simulateScenario(baselineOf(ctx.state.view()), i.levers, i.assumptions); },
});

export const recommendActions = defineTool({
  name: 'recommend-actions', category: 'Business Intelligence', core: false,
  description: 'Translate findings into actions with intervention, expected benefit (labeled hypothetical), effort, risks and evidence, ranked by benefit-to-effort.',
  input: z.object({ top: z.number().int().min(1).max(20).default(6) }),
  output: z.object({ actions: z.array(z.object({ findingId: z.string(), problem: z.string(), intervention: z.string(), expectedBenefitUsd: z.number().nullable(), benefitKind: z.enum(['profit', 'revenue']), benefitBasis: z.string(), effort: z.enum(['low', 'medium', 'high']), risks: z.string(), severity: z.string(), benefitToEffort: z.number().nullable(), evidence: z.record(z.unknown()) })) }),
  async handler(ctx, { top }) { return { actions: recommend(analyzeSmart(ctx.state.view()).slice(0, top)) }; },
});

export const generateExecutiveSummary = defineTool({
  name: 'generate-executive-summary', category: 'Business Intelligence', core: false,
  description: 'Management report: top 3 findings, implications, priority recommendations, financial assumptions and a roadmap, as Markdown.',
  input: z.object({}),
  output: z.object({ markdown: z.string(), topFindings: z.array(z.record(z.unknown())), recommendations: z.array(z.record(z.unknown())), scenario: z.record(z.unknown()), topics: z.array(z.record(z.unknown())), roadmap: z.array(z.record(z.unknown())) }),
  async handler(ctx) { const v = ctx.state.view(); return executiveSummary(v, analyzeSmart(v)) as any; },
});

export const auditDashboardQuality = defineTool({
  name: 'audit-dashboard-quality', category: 'Business Intelligence', core: false,
  description: 'Combined auditor: statistical validation of the data plus design and color checks of a dashboard spec.',
  input: z.object({ spec: DashboardSpecSchema }),
  output: z.object({ designScore: z.number(), grade: z.string(), designIssues: z.array(z.record(z.unknown())), dataIssues: z.array(z.object({ title: z.string(), severity: z.string() })), colorIssues: z.array(z.record(z.unknown())) }),
  async handler(ctx, { spec }) {
    const a = auditDashboard(spec);
    const colors = [...new Set(spec.charts.flatMap((c) => c.colors ?? []))];
    return {
      designScore: a.score, grade: a.grade, designIssues: a.issues as any[],
      dataIssues: analyzeSmart(ctx.state.view()).filter((f) => f.category === 'data-quality' || f.category === 'outlier').map((f) => ({ title: f.title, severity: f.severity })),
      colorIssues: (colors.length ? analyzeColors(colors, spec.background ?? '#ffffff').issues : []) as any[],
    };
  },
});
export const EXTRA_TOOLS = [runScenario, recommendActions, generateExecutiveSummary, auditDashboardQuality];
