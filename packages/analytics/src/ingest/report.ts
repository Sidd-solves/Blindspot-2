import { prepareTransactions, type PrepReport } from '../retail';

export const ROLES = [
  'date',
  'order',
  'product',
  'sku',
  'quantity',
  'price',
  'amount',
  'customer',
  'country',
  'region',
  'status',
  'currency',
  'discount',
  'refund',
  'cost',
  'profit',
  'category',
  'cancelled',
] as const;
export type Role = (typeof ROLES)[number];
export type RoleMap = Partial<Record<Role, string>>;
export type DateOrder = 'ymd' | 'mdy' | 'dmy';

export const ROLE_LABEL: Record<Role, string> = {
  date: 'Order date',
  order: 'Order number',
  product: 'Product',
  sku: 'SKU',
  quantity: 'Quantity',
  price: 'Unit price',
  amount: 'Sale amount',
  customer: 'Customer',
  country: 'Country',
  region: 'State / region',
  status: 'Order status',
  currency: 'Currency',
  discount: 'Discount',
  refund: 'Refunded amount',
  cost: 'Unit cost',
  profit: 'Profit',
  category: 'Category',
  cancelled: 'Cancelled at',
};

export interface Issue {
  kind: string;
  severity: 'dropped' | 'kept' | 'info';
  count: number;
  lines: number[];
  message: string;
  role?: Role;
}
export interface Unlock {
  key: string;
  label: string;
  ok: boolean | 'partial';
  note: string;
}
export interface IngestReport {
  files: {
    name: string;
    format: string;
    rows: number;
    delimiter: string;
    headerLine: number;
    how?: string;
  }[];
  format: string;
  platform: string | null;
  columns: string[];
  roles: RoleMap;
  confidence: Partial<Record<Role, number>>;
  samples: Partial<Record<Role, string[]>>;
  dateOrder: DateOrder | null;
  dateOrderAssumed: boolean;
  currency: string | null;
  currencySource: string;
  rowsRead: number;
  rowsUsed: number;
  ordersFound: number;
  /** How source rows become analysis records: read → left out → used (+ return records created from refunds) → analyzed. */
  bridge?: {
    read: number;
    leftOut: number;
    used: number;
    refundRecordsAdded: number;
    saleRecords: number;
    returnRecords: number;
    analysed: number;
  };
  issues: Issue[];
  unlocks: Unlock[];
  dateRange: [string, string] | null;
  prep: PrepReport | null;
}
export class IngestError extends Error {
  constructor(
    public code: string,
    message: string,
    public report?: Partial<IngestReport>,
  ) {
    super(message);
  }
}
