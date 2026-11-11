import { z } from 'zod';
import {
  auditDashboard,
  critiqueStyle,
  analyzeColors,
  generatePalette,
  analyzeSmart,
  detectFields,
  type DashboardSpec,
  type Row,
} from '@blindspot/analytics';
import { defineTool, num, type ToolContext } from '../core';

export const DashboardSpecSchema = z.object({
  charts: z
    .array(
      z.object({
        id: z.string().max(80),
        type: z.string().max(40),
        title: z.string().max(200).optional(),
        yAxisStartsAtZero: z.boolean().optional(),
        hasAxisLabels: z.boolean().optional(),
        slices: z.number().int().min(0).max(500).optional(),
        series: z.number().int().min(0).max(500).optional(),
        dualAxis: z.boolean().optional(),
        colors: z
          .array(z.string().regex(/^#[0-9a-fA-F]{3,6}$/))
          .max(40)
          .optional(),
      }),
    )
    .max(60),
  kpiCount: z.number().int().min(0).max(50).optional(),
  minFontPx: z.number().min(4).max(72).optional(),
  hasFilters: z.boolean().optional(),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{3,6}$/)
    .optional(),
});

/** Describe the current Blindspot canvas dashboard as a spec when the caller does not pass one. */
function currentSpec(ctx: ToolContext): DashboardSpec {
  const dash = [...ctx.state.canvas].reverse().find((c) => c.kind === 'dashboard');
  const charts = ((dash?.spec as any)?.charts ?? []).map((c: any) => ({
    id: c.id,
    type: c.type,
    title: c.title,
    yAxisStartsAtZero: true,
    hasAxisLabels: true,
  }));
  return { charts, kpiCount: (dash?.spec as any)?.kpis?.length ?? 0, minFontPx: 11, hasFilters: true };
}

const Issue = z.object({
  area: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  target: z.string(),
  message: z.string(),
  fix: z.string(),
});

export const analyzeDesign = defineTool({
  name: 'analyze-design',
  category: 'Design Analysis',
  description:
    'Evaluate dashboard usability: hierarchy, clutter, labeling, chart integrity, accessibility. Vision review runs only when a real dashboard image exists and an AI provider is configured.',
  input: z.object({ spec: DashboardSpecSchema.optional(), useVision: z.boolean().default(true) }),
  output: z.object({
    score: z.number(),
    grade: z.string(),
    issues: z.array(Issue),
    vision: z.object({ ran: z.boolean(), reason: z.string().optional(), review: z.string().optional() }),
  }),
  async handler(ctx, { spec, useVision }) {
    const audit = auditDashboard(spec ?? currentSpec(ctx));
    let vision: { ran: boolean; reason?: string; review?: string } = {
      ran: false,
      reason: 'Vision not requested.',
    };
    if (useVision) {
      if (!ctx.state.lastImage)
        vision = {
          ran: false,
          reason:
            'No dashboard image captured. Run get-dashboard-screenshot first; vision never runs on a substitute image.',
        };
      else if (!ctx.llm?.configured || !ctx.llm.describeImage)
        vision = { ran: false, reason: 'No AI provider configured (ANTHROPIC_API_KEY).' };
      else
        vision = {
          ran: true,
          review: await ctx.llm.describeImage(
            ctx.state.lastImage.base64,
            ctx.state.lastImage.mediaType,
            'Review this BI dashboard for visual hierarchy, clutter, misleading charts, missing labels and accessibility. Be specific and concise.',
          ),
        };
    }
    return { ...audit, vision };
  },
});

export const analyzeIronVizStyle = defineTool({
  name: 'analyze-iron-viz-style',
  category: 'Design Analysis',
  description:
    'Expert-style critique of storytelling, clarity and analytical usefulness, inspired by Tableau community best practice. Not an official Iron Viz score.',
  input: z.object({ spec: DashboardSpecSchema.optional() }),
  output: z.object({
    disclaimer: z.string(),
    scores: z.record(z.string(), z.number()),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
  }),
  async handler(ctx, { spec }) {
    return critiqueStyle(spec ?? currentSpec(ctx), analyzeSmart(ctx.state.view()).length);
  },
});

export const analyzeColorHarmony = defineTool({
  name: 'analyze-color-harmony',
  category: 'Design Analysis',
  description:
    'Check colors for WCAG contrast, colorblind confusion (protan/deutan/tritan simulation) and palette size.',
  input: z.object({
    colors: z
      .array(z.string().regex(/^#[0-9a-fA-F]{3,6}$/))
      .min(1)
      .max(40),
    background: z
      .string()
      .regex(/^#[0-9a-fA-F]{3,6}$/)
      .default('#ffffff'),
  }),
  output: z.object({
    contrast: z.array(z.object({ color: z.string(), ratio: z.number() })),
    cvdClashes: z.array(z.object({ kind: z.string(), a: z.string(), b: z.string(), distance: z.number() })),
    issues: z.array(z.object({ severity: z.string(), message: z.string() })),
    passes: z.boolean(),
  }),
  async handler(_ctx, { colors, background }) {
    return analyzeColors(colors, background);
  },
});

export const generateTableauPalette = defineTool({
  name: 'generate-tableau-palette',
  category: 'Design Analysis',
  description:
    'Generate an accessible categorical, sequential or diverging palette plus the Preferences.tps XML Tableau reads.',
  input: z.object({
    count: z.number().int().min(2).max(12).default(6),
    kind: z.enum(['categorical', 'sequential', 'diverging']).default('categorical'),
    name: z
      .string()
      .regex(/^[\w -]{1,40}$/)
      .default('Blindspot'),
    background: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#ffffff'),
  }),
  output: z.object({
    kind: z.string(),
    colors: z.array(z.string()),
    fullySafeCount: z.number(),
    note: z.string().nullable(),
    tableauPreferencesXml: z.string(),
    check: z.object({ passes: z.boolean() }).passthrough(),
  }),
  async handler(_ctx, i) {
    return generatePalette(i.count, i.kind, i.name, i.background);
  },
});

export const suggestAnnotations = defineTool({
  name: 'suggest-annotations',
  category: 'Design Analysis',
  description:
    'Recommend chart annotations anchored to real data points: declines, outliers, losses and concentration.',
  input: z.object({ max: z.number().int().min(1).max(20).default(6) }),
  output: z.object({
    annotations: z.array(
      z.object({
        kind: z.string(),
        anchor: z.record(z.string(), z.unknown()),
        text: z.string(),
        severity: z.string(),
      }),
    ),
  }),
  async handler(ctx, { max }) {
    const v = ctx.state.view(),
      fm = detectFields(v);
    const out: { kind: string; anchor: Record<string, unknown>; text: string; severity: string }[] = [];
    for (const f of analyzeSmart(v)) {
      const e = f.evidence as any;
      if (f.category === 'trend')
        out.push({
          kind: 'decline',
          anchor: { [e.dimension]: e.segment, from: e.window?.recentFrom },
          text: `${e.segment}: -${Math.round(Math.abs(e.trendPct) * 100)}% vs prior 6 months`,
          severity: f.severity,
        });
      if (f.category === 'profitability')
        out.push({
          kind: 'loss',
          anchor: { [e.dimension]: e.segment },
          text: `${e.segment} margin ${(e.margin * 100).toFixed(1)}%`,
          severity: f.severity,
        });
      if (f.category === 'concentration')
        out.push({
          kind: 'concentration',
          anchor: { group: e.topGroups?.[0]?.key },
          text: `Top 5 = ${Math.round(e.top5Share * 100)}% of ${fm.measure}`,
          severity: f.severity,
        });
      if (f.category === 'outlier') {
        const top = [...v.rows].sort((a: Row, b: Row) => num(b[fm.measure]) - num(a[fm.measure]))[0];
        out.push({
          kind: 'outlier',
          anchor: { [fm.date ?? 'row']: top?.[fm.date ?? ''] ?? null, value: top?.[fm.measure] },
          text: `Largest order $${Math.round(num(top?.[fm.measure])).toLocaleString()}: verify`,
          severity: f.severity,
        });
      }
    }
    return { annotations: out.slice(0, max) };
  },
});
export const DESIGN_TOOLS = [
  analyzeDesign,
  analyzeIronVizStyle,
  analyzeColorHarmony,
  generateTableauPalette,
  suggestAnnotations,
];
