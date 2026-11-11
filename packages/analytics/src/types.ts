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
  /** What pValue is: a raw p-value ('p', default) or a Benjamini–Hochberg adjusted q-value ('q', with the raw p in pRaw). */
  pKind?: 'p' | 'q';
  pRaw?: number | null;
  /** The period the money figure covers, e.g. "whole file", "per year", "last 180 days". */
  period: string | null;
  /** What the money figure is: lost (already gone), at-risk (could be lost), reversed (cancelled, never earned), untracked (sales not linked to a customer). */
  exposure: 'lost' | 'at-risk' | 'reversed' | 'untracked' | null;
  /** Drill-through: the rows behind the finding (see DrillSpec). */
  drill?: DrillSpec | null;
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

/**
 * A structured row selection. "Exact" applies every predicate (values, date windows, row type) and should
 * reproduce the finding's figure; "history" keeps only `field in values` (all related rows, any date or type).
 */
export interface DrillSpec {
  field: string;
  values: string[];
  label: string;
  /** How many values the finding covers; `values` is never truncated silently (values.length === totalValues). */
  totalValues?: number;
  /** Which rows count: sale lines, return lines, or all. */
  rowType?: 'sale' | 'return' | 'all';
  /** Date column and the windows (epoch ms, [from, to)) the figure was computed over. */
  dateField?: string;
  windows?: { label: string; from: number; to: number; expect?: number }[];
  /** The figure these rows should add up to, and what it is (e.g. "sales in the prior year"). */
  expect?: { value: number; what: string } | null;
}

/** Execution record emitted by each check while it runs (not reconstructed afterwards). */
export interface CheckRun {
  id: string;
  /** Report topic the check belongs to (customers, markets, profit, trend, retention, returns, products, seasonality, orders, data). */
  topic: string;
  label: string;
  /** false when the data lacks what the check needs at all (e.g. no profit column). */
  eligible: boolean;
  ran: boolean;
  reason: string | null;
  /** The date range the check actually looked at, when it used one (ISO dates). */
  from?: string; to?: string;
}
