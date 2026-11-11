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
  earlyWarning,
  winBackList,
  stockOuts,
  cashRadar,
  eventImpact,
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
    forecast: z.array(
      z.object({ month: Month, value: z.number(), low: z.number().nullable(), high: z.number().nullable() }),
    ),
    coverage: z.number(),
    notes: z.array(z.string()),
  }),
  async handler(ctx, { horizon }) {
    const v = ctx.state.view(),
      fm = detectFields(v);
    return memo(v.rows, `forecast:${horizon}`, () => forecastSales(v.rows, fm.date, fm.measure, { horizon }));
  },
});
export const earlyWarningTool = defineTool({
  name: 'early-warning',
  category: 'Business Intelligence',
  core: false,
  description:
    'Customers slipping away before they are lost: repeat customers silent 45-90 days, ranked by their last-year spend. The rule is replayed 90 days in the past using only earlier orders, and the result says how often flagged customers really stayed away versus everyone else (two-proportion z-test).',
  input: z.object({ top: z.number().int().min(1).max(500).default(50) }),
  output: z.object({
    ok: z.boolean(),
    reason: z.string().optional(),
    asOf: z.string(),
    rule: z.string(),
    backtest: z
      .object({
        asOf: z.string(),
        windowDays: z.number(),
        flagged: z.number(),
        flaggedStayedAway: z.number(),
        others: z.number(),
        othersStayedAway: z.number(),
        p: z.number().nullable(),
        method: z.string(),
      })
      .nullable(),
    customers: z.array(
      z.object({
        customer: z.string(),
        orders: z.number(),
        typicalGapDays: z.number(),
        silentDays: z.number(),
        lateBy: z.number(),
        lastOrder: z.string(),
        expectedBy: z.string(),
        yearSpend: z.number(),
      }),
    ),
    total: z.number(),
    valueAtRisk: z.number(),
    spread: z.array(
      z.object({
        silentDays: z.number(),
        yearSpend: z.number(),
        zone: z.enum(['active', 'slipping', 'lost']),
      }),
    ),
  }),
  async handler(ctx, { top }) {
    const v = ctx.state.view();
    const r = memo(v.rows, 'early-warning', () => earlyWarning(v));
    return { ...r, total: r.customers.length, customers: r.customers.slice(0, top) };
  },
});

export const winBackTool = defineTool({
  name: 'win-back-list',
  category: 'Business Intelligence',
  core: false,
  description:
    'The best customers who went quiet (same definition as the lost-customer finding), each with what they used to buy, their spend and a plain draft message to send. Read-only: nothing is sent.',
  input: z.object({ shopName: z.string().max(80).default('our shop') }),
  output: z.object({
    ok: z.boolean(),
    reason: z.string().optional(),
    cutoff: z.string(),
    customers: z.array(
      z.object({
        customer: z.string(),
        email: z.string().nullable(),
        orders: z.number(),
        spend: z.number(),
        lastOrder: z.string(),
        daysSilent: z.number(),
        topProducts: z.array(z.string()),
        message: z.string(),
      }),
    ),
    total: z.number(),
  }),
  async handler(ctx, { shopName }) {
    return winBackList(ctx.state.view(), shopName);
  },
});

export const stockOutsTool = defineTool({
  name: 'stock-outs',
  category: 'Business Intelligence',
  core: false,
  description:
    "Unusual sales gaps (possible stock-outs): products ordered most trading days that got no orders for 5-60 trading days, then sold again. Counts distinct orders; each gap is tested against the product's usual daily order rate (Poisson, slowed by the product's own burstiness), corrected for searching its whole history and across products (Benjamini-Hochberg). Needs order IDs. Shows that something changed, not why (no stock data). Sales not made is a rough estimate.",
  input: z.object({ top: z.number().int().min(1).max(200).default(30) }),
  output: z.object({
    ok: z.boolean(),
    reason: z.string().optional(),
    scanned: z.number(),
    method: z.string(),
    items: z.array(
      z.object({
        product: z.string(),
        from: z.string(),
        to: z.string(),
        tradingDays: z.number(),
        rateBefore: z.number(),
        rateAfter: z.number(),
        p: z.number(),
        q: z.number(),
        lostSales: z.number(),
      }),
    ),
    found: z.number(),
    totalLost: z.number(),
    range: z.tuple([z.string(), z.string()]).nullable(),
  }),
  async handler(ctx, { top }) {
    const v = ctx.state.view();
    const r = memo(v.rows, 'stock-outs', () => stockOuts(v));
    return { ...r, found: r.items.length, items: r.items.slice(0, top) };
  },
});

export const cashRadarTool = defineTool({
  name: 'cash-radar',
  category: 'Business Intelligence',
  core: false,
  description:
    'Seasonal sales dips: each calendar month as an index against an average month (from full 12-month years), how many years it ran below average, and months at least 15% below average in every year with the revenue difference. Revenue only, not a cash-flow forecast.',
  input: z.object({}),
  output: z.object({
    ok: z.boolean(),
    reason: z.string().optional(),
    years: z.array(z.number()),
    months: z.array(
      z.object({
        month: z.number(),
        label: z.string(),
        index: z.number(),
        belowIn: z.number(),
        typical: z.number(),
      }),
    ),
    averageMonth: z.number(),
    crunch: z.array(z.object({ label: z.string(), gap: z.number() })),
    crunchGap: z.number(),
  }),
  async handler(ctx) {
    const v = ctx.state.view();
    return memo(v.rows, 'cash-radar', () => cashRadar(v));
  },
});

export const eventImpactTool = defineTool({
  name: 'event-impact',
  category: 'Business Intelligence',
  core: false,
  description:
    'Was it the promo? Compares weekly sales before and after a date (a promotion, price change, free shipping) against the same weeks a year earlier, so the season is controlled (Welch t-test on weekly log year-over-year ratios, 8 weeks before vs the weeks after), and reports how many other start dates showed a shift as big (context, not a false-alarm rate). Shows a change around the date, not that the date caused it.',
  input: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weeks: z.number().int().min(3).max(26).default(8),
    filter: z.object({ field: z.string().max(100), value: z.string().max(200) }).optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    reason: z.string().optional(),
    date: z.string(),
    label: z.string(),
    control: z.enum(['same-weeks-last-year', 'none']),
    preWeeks: z.number(),
    postWeeks: z.number(),
    effect: z.number().nullable(),
    actual: z.number(),
    expected: z.number(),
    extra: z.number(),
    p: z.number().nullable(),
    pTwoSided: z.number().nullable(),
    method: z.string(),
    verdict: z.enum(['rose', 'fell', 'no-clear-change', 'not-enough-data']),
    placebo: z.object({ tested: z.number(), asBig: z.number(), rate: z.number().nullable() }),
    weekly: z.array(
      z.object({
        week: z.string(),
        actual: z.number(),
        expected: z.number(),
        phase: z.enum(['before', 'after']),
      }),
    ),
  }),
  async handler(ctx, i) {
    return eventImpact(ctx.state.view(), i);
  },
});

export const EXTRA_TOOLS = [
  runScenario,
  recommendActions,
  generateExecutiveSummary,
  auditDashboardQuality,
  forecastSalesTool,
  earlyWarningTool,
  winBackTool,
  stockOutsTool,
  cashRadarTool,
  eventImpactTool,
];
