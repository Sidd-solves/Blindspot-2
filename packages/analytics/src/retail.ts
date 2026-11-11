import type { Dataset, Row } from './types';

/**
 * Transaction-log support: raw order lines (invoice, product, quantity, price, customer, date)
 * are cleaned into Blindspot's canonical shape, and every cleaning decision is counted so the
 * data-quality problems themselves become findings.
 */
export interface PrepReport {
  inputRows: number; keptRows: number;
  returnLines: number; returnValue: number;
  duplicateRows: number; feeLines: number; feeValue: number;
  zeroPriceRows: number; missingCustomerRows: number; missingCustomerSales: number;
  /** Orders cancelled within 2 days of being placed (e.g. a mistaken bulk order): removed from both sales and returns. */
  cancelledPairs: number; cancelledPairValue: number;
  feeCodes: string[];
}

const FEE_CODES = new Set(['POST', 'DOT', 'M', 'C2', 'D', 'S', 'BANK CHARGES', 'ADJUST', 'ADJUST2', 'AMAZONFEE', 'CRUK', 'B', 'PADS', 'TEST001', 'TEST002', 'GIFT']);
const FEE_DESC = /postage|carriage|manual|discount|bank charges|amazon fee|adjust|samples|cruk|commission/i;

type Map = { order: string; product: string; qty: string; price: string; date: string; customer?: string; country?: string; code?: string };
const find = (cols: string[], ...res: RegExp[]) => cols.find((c) => res.some((re) => re.test(c)));

export function detectTransactionColumns(rows: Row[]): Map | null {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const order = find(cols, /^invoice(no|_?id)?$/i, /^order(_?id|no|number)?$/i, /^transaction(_?id)?$/i);
  const qty = find(cols, /^quantity$/i, /^qty$/i, /^units?$/i);
  const price = find(cols, /^(unit_?)?price$/i, /^unitprice$/i);
  const date = find(cols, /invoice_?date/i, /^order_?date$/i, /^date$/i, /^created_?at$/i);
  const product = find(cols, /^description$/i, /^product(_?name)?$/i, /^item(_?name)?$/i);
  if (!order || !qty || !price || !date || !product) return null;
  return { order, qty, price, date, product, customer: find(cols, /^customer[ _]?id$/i, /^customer$/i, /^client(_?id)?$/i), country: find(cols, /^country$/i, /^region$/i), code: find(cols, /^stock_?code$/i, /^sku$/i) };
}

export function prepareTransactions(rows: Row[], name: string, opts: { currency?: string; label?: string } = {}): Dataset | null {
  const m = detectTransactionColumns(rows);
  if (!m) return null;
  const rep: PrepReport = { inputRows: rows.length, keptRows: 0, returnLines: 0, returnValue: 0, duplicateRows: 0, feeLines: 0, feeValue: 0, zeroPriceRows: 0, missingCustomerRows: 0, missingCustomerSales: 0, cancelledPairs: 0, cancelledPairValue: 0, feeCodes: [] };
  const seen = new Set<string>(), fees = new Set<string>(), out: Row[] = [];
  for (const r of rows) {
    const key = JSON.stringify(Object.values(r));
    if (seen.has(key)) { rep.duplicateRows++; continue; }
    seen.add(key);
    const qty = Number(r[m.qty]), price = Number(r[m.price]);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) continue;
    const code = m.code ? String(r[m.code] ?? '').trim() : '';
    const desc = String(r[m.product] ?? '').trim();
    const value = qty * price;
    if ((code && (FEE_CODES.has(code.toUpperCase()) || !/^\d/.test(code))) || (!code && FEE_DESC.test(desc))) { rep.feeLines++; rep.feeValue += value; fees.add(code || desc); continue; }
    if (price === 0) { rep.zeroPriceRows++; continue; }
    const isReturn = qty < 0 || String(r[m.order]).toUpperCase().startsWith('C');
    const customer = m.customer && r[m.customer] !== null && r[m.customer] !== '' ? String(r[m.customer]).replace(/\.0$/, '') : null;
    if (isReturn) { rep.returnLines++; rep.returnValue += Math.abs(value); }
    else if (!customer) { rep.missingCustomerRows++; rep.missingCustomerSales += value; }
    out.push({
      OrderDate: String(r[m.date]).slice(0, 10), Order: String(r[m.order]),
      Customer: customer ?? 'Unknown customer', Country: m.country ? String(r[m.country] ?? 'Unknown') : 'All',
      Product: desc || code || 'Unknown product', Quantity: qty,
      Sales: Math.round(value * 100) / 100, IsReturn: isReturn ? 1 : 0,
    });
  }
  // A cancellation that exactly mirrors a sale (same customer, product, quantity and price) within 2 days
  // is a reversed order, not a sale plus a return. Remove both so neither inflates the analysis.
  const DAYMS = 86400000, open = new Map<string, number[]>(), drop = new Set<number>();
  out.forEach((r, i) => { if (r.IsReturn !== 1 && r.Customer !== 'Unknown customer') { const k = `${r.Customer}|${r.Product}|${r.Quantity}|${(r.Sales as number) / (r.Quantity as number)}`; (open.get(k) ?? open.set(k, []).get(k)!).push(i); } });
  out.forEach((r, i) => {
    if (r.IsReturn !== 1 || r.Customer === 'Unknown customer') return;
    const q = -(r.Quantity as number), k = `${r.Customer}|${r.Product}|${q}|${(r.Sales as number) / (r.Quantity as number)}`;
    const cands = open.get(k); if (!cands) return;
    const rt = Date.parse(String(r.OrderDate));
    const j = cands.findIndex((si) => { const st = Date.parse(String(out[si].OrderDate)); return !drop.has(si) && st <= rt && rt - st <= 2 * DAYMS; });
    if (j < 0) return;
    const si = cands.splice(j, 1)[0];
    drop.add(si); drop.add(i);
    rep.cancelledPairs++; rep.cancelledPairValue += out[si].Sales as number;
    rep.returnLines--; rep.returnValue -= Math.abs(r.Sales as number);
  });
  if (drop.size) { let w = 0; for (let i = 0; i < out.length; i++) if (!drop.has(i)) out[w++] = out[i]; out.length = w; }
  rep.cancelledPairValue = Math.round(rep.cancelledPairValue);
  rep.keptRows = out.length; rep.returnValue = Math.round(rep.returnValue); rep.feeValue = Math.round(rep.feeValue);
  rep.missingCustomerSales = Math.round(rep.missingCustomerSales); rep.feeCodes = [...fees].slice(0, 12);
  return { name, source: 'csv', label: opts.label ?? 'Uploaded transaction log (cleaned)', rows: out, currency: opts.currency, prep: rep };
}

/** Rows that are actual sales (not returns). Analyses of revenue use this. */
export const salesRows = (rows: Row[]) => rows.filter((r) => r.IsReturn !== 1);
export const isTransactional = (ds: Dataset) => ds.rows.length > 0 && 'IsReturn' in ds.rows[0] && 'Order' in ds.rows[0] && 'Customer' in ds.rows[0];
