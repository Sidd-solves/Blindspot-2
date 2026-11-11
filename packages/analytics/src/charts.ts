import type { ColumnProfile } from './types';

export type ChartType = 'kpi' | 'line' | 'bar' | 'table' | 'scatter' | 'stackedBar';
export interface ChartSpec {
  type: ChartType;
  x?: string;
  y?: string;
  series?: string;
}

export function validateChartFields(spec: ChartSpec, columns: ColumnProfile[]) {
  const col = (n?: string) => columns.find((c) => c.name === n);
  const errors: string[] = [];
  const x = col(spec.x),
    y = col(spec.y),
    s = col(spec.series);
  if (spec.x && !x) errors.push(`Field "${spec.x}" does not exist.`);
  if (spec.y && !y) errors.push(`Field "${spec.y}" does not exist.`);
  if (spec.series && !s) errors.push(`Series field "${spec.series}" does not exist.`);
  if (spec.type !== 'table' && spec.type !== 'kpi' && !spec.y) errors.push('A measure (y) is required.');
  if (y && y.type !== 'number') errors.push(`"${y.name}" must be numeric to be a measure (it is ${y.type}).`);
  if (spec.type === 'line' && x && x.type !== 'date' && x.type !== 'number')
    errors.push(`Line charts need a date or numeric x; "${x.name}" is ${x.type}.`);
  if ((spec.type === 'bar' || spec.type === 'stackedBar') && x && x.type === 'number')
    errors.push(`Bars need a categorical x; "${x.name}" is numeric.`);
  if (spec.type === 'scatter' && x && x.type !== 'number') errors.push('Scatter needs numeric x.');
  if (x && x.type !== 'number' && x.distinct > 40 && spec.type !== 'line')
    errors.push(
      `"${x.name}" has ${x.distinct} categories; too many for a readable ${spec.type}. Aggregate or filter first.`,
    );
  return { valid: errors.length === 0, errors };
}

export function recommendChart(
  intent: 'trend' | 'comparison' | 'composition' | 'relationship' | 'single-value' | 'detail',
) {
  const m: Record<string, { type: ChartType; why: string; avoid: string }> = {
    trend: { type: 'line', why: 'Lines show change over ordered time.', avoid: 'Pie or unordered bars.' },
    comparison: {
      type: 'bar',
      why: 'Bar length compares magnitudes accurately; start the axis at zero.',
      avoid: 'Truncated axes, 3D, pies with many slices.',
    },
    composition: {
      type: 'stackedBar',
      why: 'Stacked bars show parts of a whole across groups.',
      avoid: 'Pies with more than 5 slices.',
    },
    relationship: {
      type: 'scatter',
      why: 'Scatter reveals correlation and outliers between two measures.',
      avoid: 'Dual-axis lines that imply false correlation.',
    },
    'single-value': {
      type: 'kpi',
      why: 'A KPI card is the fastest read for one number.',
      avoid: 'Gauges with no context.',
    },
    detail: {
      type: 'table',
      why: 'Tables serve lookup of exact values.',
      avoid: 'Tables when the goal is pattern finding.',
    },
  };
  return m[intent];
}

export interface DashboardSpec {
  charts: {
    id: string;
    type: string;
    title?: string;
    yAxisStartsAtZero?: boolean;
    hasAxisLabels?: boolean;
    slices?: number;
    series?: number;
    dualAxis?: boolean;
    colors?: string[];
  }[];
  kpiCount?: number;
  minFontPx?: number;
  hasFilters?: boolean;
  background?: string;
}
