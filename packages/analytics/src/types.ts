export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export interface Dataset {
  name: string;
  source: 'sample' | 'csv' | 'tableau' | 'shopify' | 'case-study';
  /** Human-facing label. Sample data must always say it is synthetic. */
  label: string;
  rows: Row[];
  /** ISO currency code for money formatting (default USD). */
  currency?: string;
  /** Cleaning report when the dataset was prepared from a raw transaction log. */
  prep?: import('./retail').PrepReport;
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
  category: 'concentration' | 'profitability' | 'trend' | 'outlier' | 'data-quality' | 'pricing' | 'returns' | 'retention' | 'product' | 'seasonality' | 'anomaly';
  title: string;
  severity: Severity;
  /** 0..1 strength of evidence, used for ranking: 1 for measured facts, 1 − p for tested findings, 0.75 for rule-of-thumb checks. */
  confidence: number;
  /** How it is known: measured (counted directly), tested (significance test; see pValue), rule (a threshold check). */
  basis: 'measured' | 'tested' | 'rule';
  /** p-value of the test (false-discovery-rate adjusted for scans); null unless basis is "tested". */
  pValue: number | null;
  /** The period the money figure covers, e.g. "whole file", "per year", "last 180 days". */
  period: string | null;
  /** What the money figure is: lost (already gone), at-risk (could be lost), reversed (cancelled, never earned), untracked (sales not linked to a customer). */
  exposure: 'lost' | 'at-risk' | 'reversed' | 'untracked' | null;
  /** The exact rows behind the finding, for drill-through: rows where `field` is one of `values`. */
  drill?: { field: string; values: string[]; label: string } | null;
  metric: string;
  explanation: string;
  evidence: Record<string, unknown>;
  /** Money involved, in the data's currency, when it can be computed; otherwise null */
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
