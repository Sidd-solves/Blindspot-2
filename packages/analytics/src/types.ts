export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export interface Dataset {
  name: string;
  source: 'sample' | 'csv' | 'tableau' | 'shopify';
  /** Human-facing label. Sample data must always say it is synthetic. */
  label: string;
  rows: Row[];
}

export type ColType = 'number' | 'category' | 'date' | 'text';

export interface ColumnProfile {
  name: string;
  type: ColType;
  count: number;
  nulls: number;
  nullPct: number;
  distinct: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
  std?: number;
  outliers?: number;
  topValues?: { value: string; count: number }[];
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  category: 'concentration' | 'profitability' | 'trend' | 'outlier' | 'data-quality' | 'pricing';
  title: string;
  severity: Severity;
  /** 0..1 strength of the statistical evidence */
  confidence: number;
  metric: string;
  explanation: string;
  evidence: Record<string, unknown>;
  /** Dollar exposure when it can be computed from the data, otherwise null */
  impactUsd: number | null;
  impactBasis: string | null;
  nextAction: string;
  score: number;
}

export interface FieldMap {
  measure: string;
  profit: string | null;
  date: string | null;
  discount: string | null;
  dims: string[];
  highCardDims: string[];
}
