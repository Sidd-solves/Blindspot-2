import { z } from 'zod';
import {
  analyzeSmart,
  recommend,
  simulateScenario,
  executiveSummary,
  baselineOf,
  auditDashboard,
  analyzeColors,
  forecastSales,
  detectFields,
} from '@blindspot/analytics';
import { defineTool, memo } from '../core';
import { DashboardSpecSchema } from './design';

export const runScenario = defineTool({
  name: 'run-scenario',
  category: 'Business Intelligence',
  core: false,
  description:
    'Financial impact simulator: churn, conversion, waste and opex levers with explicit, editable assumptions. Output is hypothetical.',
  input: z.object({
    levers: z
      .object({
        churnReductionPct: z.number().min(0).max(100).default(5),
        conversionLiftPts: z.number().min(0).max(20).default(0),
        wasteReductionPct: z.number().min(0).max(100).default(0),
        opexReductionPct: z.number().min(0).max(100).default(0),
      })
      .prefault({}),
    assumptions: z
      .object({
        annualChurnRate: z.number().min(0).max(1),
        baselineConversion: z.number().min(0.0001).max(1),
        wasteRateOfCogs: z.number().min(0).max(1),
        opexRateOfRevenue: z.number().min(0).max(1),
        assumedMargin: z.number().min(0).max(1),
      })
      .partial()
      .prefault({}),
  }),
  output: z.object({
    hypothetical: z.literal(true),
    horizonYears: z.number(),
    baseline: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
    profitChangePct: z.number().nullable(),
    scenario: z.record(z.string(), z.number()),
    delta: z.record(z.string(), z.number()),
    contributions: z.record(z.string(), z.number()),
    assumptions: z.record(z.string(), z.number()),
    levers: z.record(z.string(), z.number()),
    formulas: z.array(z.string()),
    disclaimer: z.string(),
  }),
  async handler(ctx, i) {
    return simulateScenario(baselineOf(ctx.state.view()), i.levers, i.assumptions);
  },
});

export const recommendActions = defineTool({
  name: 'recommend-actions',
  category: 'Business Intelligence',
  core: false,
  description:
    'Translate findings into actions with intervention, expected benefit (labeled hypothetical), effort, risks and evidence, ranked by benefit-to-effort.',
  input: z.object({ top: z.number().int().min(1).max(20).default(6) }),
  output: z.object({
    actions: z.array(
      z.object({
        findingId: z.string(),
        problem: z.string(),
        intervention: z.string(),
        expectedBenefitUsd: z.number().nullable(),
        benefitKind: z.enum(['profit', 'revenue']),
        benefitBasis: z.string(),
        recoveryPct: z.number().nullable().optional(),
        benefitPeriod: z.string().nullable().optional(),
        findingIds: z.array(z.string()).optional(),
        parts: z
          .array(
            z.object({
              findingId: z.string(),
              problem: z.string(),
              benefit: z.number().nullable(),
              period: z.string().nullable(),
              recoveryPct: z.number().nullable(),
            }),
          )
          .optional(),
        effort: z.enum(['low', 'medium', 'high']),
        risks: z.string(),
        severity: z.string(),
        benefitToEffort: z.number().nullable(),
        evidence: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
  async handler(ctx, { top }) {
    return { actions: recommend(analyzeSmart(ctx.state.view()).slice(0, top)) };
  },
});

export const generateExecutiveSummary = defineTool({
  name: 'generate-executive-summary',
  category: 'Business Intelligence',
  core: false,
  description:
    'Management report: top 3 findings, implications, priority recommendations, financial assumptions and a roadmap, as Markdown.',
  input: z.object({}),
  output: z.object({
    markdown: z.string(),
    topFindings: z.array(z.record(z.string(), z.unknown())),
    recommendations: z.array(z.record(z.string(), z.unknown())),
    scenario: z.record(z.string(), z.unknown()),
    topics: z.array(z.record(z.string(), z.unknown())),
    roadmap: z.array(z.record(z.string(), z.unknown())),
    forecast: z.record(z.string(), z.unknown()).optional(),
  }),
  async handler(ctx) {
    const v = ctx.state.view();
    return executiveSummary(v, analyzeSmart(v)) as any;
  },
});

export const auditDashboardQuality = defineTool({
  name: 'audit-dashboard-quality',
  category: 'Business Intelligence',
  core: false,
  description:
    'Combined auditor: statistical validation of the data plus design and color checks of a dashboard spec.',
  input: z.object({ spec: DashboardSpecSchema }),
  output: z.object({
    designScore: z.number(),
    grade: z.string(),
    designIssues: z.array(z.record(z.string(), z.unknown())),
    dataIssues: z.array(z.object({ title: z.string(), severity: z.string() })),
    colorIssues: z.array(z.record(z.string(), z.unknown())),
  }),
  async handler(ctx, { spec }) {
    const a = auditDashboard(spec);
    const colors = [...new Set(spec.charts.flatMap((c) => c.colors ?? []))];
    return {
      designScore: a.score,
      grade: a.grade,
      designIssues: a.issues as any[],
      dataIssues: analyzeSmart(ctx.state.view())
        .filter((f) => f.category === 'data-quality' || f.category === 'outlier')
        .map((f) => ({ title: f.title, severity: f.severity })),
      colorIssues: (colors.length ? analyzeColors(colors, spec.background ?? '#ffffff').issues : []) as any[],
    };
  },
});

const Month = z.string().regex(/^\d{4}-\d{2}$/);
export const forecastSalesTool = defineTool({
  name: 'forecast-sales',
  category: 'Business Intelligence',
  core: false,
  description:
    'Forecast monthly sales for the next 1-6 months with a proven track record: four simple methods are replayed on past months using only data available at the time, the method is chosen from past errors only, and the 80% range comes from real past misses. Returns the forecast, every past test month (forecast vs actual) and the measured accuracy.',
  input: z.object({ horizon: z.number().int().min(1).max(6).default(3) }),
  output: z.object({
    ok: z.boolean(),
    reason: z.string().optional(),
    measure: z.string(),
    history: z.array(z.object({ month: Month, value: z.number() })),
    partialMonth: Month.nullable(),
    method: z.object({ id: z.string(), label: z.string(), how: z.string() }).nullable(),
    methods: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        how: z.string(),
        wape: z.number().nullable(),
        months: z.number(),
      }),
    ),
    backtest: z.array(
      z.object({
        month: Month,
        actual: z.number(),
        predicted: z.number(),
        method: z.string(),
        error: z.number().nullable(),
        low: z.number().nullable(),
        high: z.number().nullable(),
        inside: z.boolean().nullable(),
      }),
    ),
    accuracy: z.object({
      wape: z.number().nullable(),
      months: z.number(),
      hitRate: z.number().nullable(),
      rangeTested: z.number(),
      bias: z.number().nullable(),
    }),
    forecast: z.array(z.object({ month: Month, value: z.number(), low: z.number(), high: z.number() })),
    coverage: z.number(),
    notes: z.array(z.string()),
  }),
  async handler(ctx, { horizon }) {
    const v = ctx.state.view(),
      fm = detectFields(v);
    return memo(v.rows, `forecast:${horizon}`, () => forecastSales(v.rows, fm.date, fm.measure, { horizon }));
  },
});
export const EXTRA_TOOLS = [
  runScenario,
  recommendActions,
  generateExecutiveSummary,
  auditDashboardQuality,
  forecastSalesTool,
];
