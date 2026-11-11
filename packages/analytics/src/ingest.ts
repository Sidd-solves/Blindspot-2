import Papa from 'papaparse';
import type { Dataset, Row } from './types';
import { prepareTransactions, type PrepReport } from './retail';

/**
 * Universal sales-file reader. Takes the text of one or more files (CSV/TSV, or Excel/PDF already turned
 * into text by the browser) and produces Blindspot's canonical rows, plus a report that says exactly how
 * every column was read, which rows were missing something, and what the file can and can't unlock.
 *
 *   text → table (delimiter, header row, encoding junk, totals) → columns → roles (platform profile or
 *   name + value scoring) → records → merge extra files → lines (numbers, dates, returns, refunds,
 *   cancellations) → cleaning (duplicates, fees, reversed orders) → dataset
 */

export const ROLES = ['date', 'order', 'product', 'sku', 'quantity', 'price', 'amount', 'customer', 'country', 'region', 'status', 'currency', 'discount', 'refund', 'cost', 'profit', 'category', 'cancelled'] as const;
export type Role = (typeof ROLES)[number];
export type RoleMap = Partial<Record<Role, string>>;
export type DateOrder = 'ymd' | 'mdy' | 'dmy';

export const ROLE_LABEL: Record<Role, string> = {
  date: 'Order date', order: 'Order number', product: 'Product', sku: 'SKU', quantity: 'Quantity', price: 'Unit price', amount: 'Sale amount',
  customer: 'Customer', country: 'Country', region: 'State / region', status: 'Order status', currency: 'Currency', discount: 'Discount',
  refund: 'Refunded amount', cost: 'Unit cost', profit: 'Profit', category: 'Category', cancelled: 'Cancelled at',
};

export interface Issue { kind: string; severity: 'dropped' | 'kept' | 'info'; count: number; lines: number[]; message: string; role?: Role }
export interface Unlock { key: string; label: string; ok: boolean | 'partial'; note: string }
export interface IngestReport {
  files: { name: string; format: string; rows: number; delimiter: string; headerLine: number; how?: string }[];
  format: string; platform: string | null;
  columns: string[]; roles: RoleMap; confidence: Partial<Record<Role, number>>; samples: Partial<Record<Role, string[]>>;
  dateOrder: DateOrder | null; dateOrderAssumed: boolean;
  currency: string | null; currencySource: string;
  rowsRead: number; rowsUsed: number; ordersFound: number;
  /** How source rows become analysis records: read → left out → used (+ return records created from refunds) → analysed. */
  bridge?: { read: number; leftOut: number; used: number; refundRecordsAdded: number; saleRecords: number; returnRecords: number; analysed: number };
  issues: Issue[]; unlocks: Unlock[];
  dateRange: [string, string] | null;
  prep: PrepReport | null;
}
export class IngestError extends Error { constructor(public code: string, message: string, public report?: Partial<IngestReport>) { super(message); } }

/* ------------------------------------------------------------------ small helpers */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const blank = (v: unknown) => v == null || String(v).trim() === '' || /^(null|n\/?a|none|-|—|nan|undefined)$/i.test(String(v).trim());
const r2 = (n: number) => Math.round(n * 100) / 100;

export const CURRENCY_CODES = new Set(['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CNY', 'CHF', 'SEK', 'NOK', 'DKK', 'NZD', 'SGD', 'HKD', 'KRW', 'MXN', 'BRL', 'ZAR', 'TRY', 'PLN', 'CZK', 'HUF', 'ILS', 'IDR', 'MYR', 'PHP', 'THB', 'RON', 'ISK', 'AED', 'SAR', 'NGN', 'KES', 'PKR', 'BDT', 'VND', 'EGP', 'COP', 'CLP', 'ARS', 'PEN', 'TWD', 'UAH', 'BGN']);
const SYMBOLS: [RegExp, string][] = [
  [/R\$/, 'BRL'], [/CA\$|C\$/, 'CAD'], [/AU?\$/, 'AUD'], [/NZ\$/, 'NZD'], [/HK\$/, 'HKD'], [/S\$/, 'SGD'], [/MX\$/, 'MXN'], [/US\$/, 'USD'], [/\$/, 'USD'],
  [/£/, 'GBP'], [/€/, 'EUR'], [/¥|￥/, 'JPY'], [/₹|\bRs\.?/, 'INR'], [/₩/, 'KRW'], [/₺/, 'TRY'], [/zł/i, 'PLN'], [/₪/, 'ILS'], [/₱/, 'PHP'], [/฿/, 'THB'], [/₦/, 'NGN'], [/Kč/, 'CZK'], [/₫/, 'VND'],
];

const COUNTRIES = new Set(('united states,usa,us,united kingdom,uk,great britain,england,scotland,wales,northern ireland,ireland,eire,canada,australia,new zealand,germany,france,spain,italy,portugal,netherlands,belgium,luxembourg,switzerland,austria,sweden,norway,denmark,finland,iceland,poland,czech republic,czechia,slovakia,hungary,romania,bulgaria,greece,cyprus,malta,croatia,slovenia,serbia,estonia,latvia,lithuania,ukraine,russia,turkey,israel,united arab emirates,uae,saudi arabia,qatar,kuwait,bahrain,oman,egypt,morocco,nigeria,kenya,south africa,rsa,ghana,india,pakistan,bangladesh,sri lanka,nepal,china,hong kong,taiwan,japan,south korea,korea,singapore,malaysia,indonesia,philippines,thailand,vietnam,mexico,brazil,argentina,chile,colombia,peru,uruguay,venezuela,ecuador,costa rica,panama,puerto rico,jamaica,lebanon,jordan,channel islands,eire,european community,unspecified,rest of world').split(','));

const STATUS_DROP = /cancel|void|fail|declin|abandon|expired|reject|unpaid|draft/i;
/** A refund/return *event* row (the row itself is the money going back). */
const STATUS_RETURN = /^(refund|return|chargeback|reversal|returned item|refund issued)$/i;
/** An order whose *state* is refunded (the row is the original sale; the money later went back). */
const STATUS_REFUNDED = /^(fully\s*)?(refunded|returned|reversed|charged\s*back)$/i;

/* ------------------------------------------------------------------ numbers */

/** Does this column write decimals with a comma ("1.234,50")? Decided from many values, not one. */
export function detectDecimalComma(values: string[], europeanHint = false): boolean {
  let comma = 0, dot = 0, ambDot = 0;
  for (const v of values) {
    const s = v.replace(/[^\d.,]/g, '');
    if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) { comma++; continue; } // 1.234.567
    if (/^\d{1,3}\.\d{3}$/.test(s)) { ambDot++; continue; }     // 1.234: thousands or decimals?
    if (/\d\.\d{3},\d/.test(s) || /^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) comma++;
    else if (/\d,\d{3}\.\d/.test(s) || /^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s) || /^\d+\.\d{1,2}$/.test(s)) dot++;
  }
  return comma > dot || (comma === 0 && dot === 0 && ambDot > 0 && europeanHint);
}

/** Strict number reader: accepts "£1,234.50", "1.234,50 €", "(12.00)", "12-", "USD 9", "−3"; rejects text like "2 x Hoodie". */
export function parseNumber(raw: unknown, decimalComma = false): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (blank(raw)) return null;
  let s = String(raw).trim().replace(/[   ']/g, ' ');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[−–]/g, '-');
  if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, ''); }
  // strip currency marks and codes
  for (const [re] of SYMBOLS) s = s.replace(new RegExp(re.source, 'gi'), '');
  s = s.replace(/\b[A-Z]{3}\b/g, (m) => (CURRENCY_CODES.has(m) ? '' : m)).replace(/%$/, '').trim();
  // currency and unit words: "40 dollars", "2 pcs", "x3", "3 units"
  s = s.replace(/\s*\b(dollars?|bucks|euros?|pounds?|quid|rupees?|yen|yuan|pesos?|reais|francs?|kronor|kroner|pcs?|pieces?|units?|ea|each|items?|stk|st|uds?|unidades?)\.?\s*$/i, '').replace(/^x\s*(?=\d)|(?<=\d)\s*x$/i, '').trim();
  if (/^-/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
  if (/^\+/.test(s)) s = s.slice(1).trim();
  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(s)) { const n = Number(s); return Number.isFinite(n) ? (neg ? -n : n) : null; }
  if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/\s/g, '');
  if (decimalComma) s = s.replace(/\./g, '').replace(',', '.');
  else {
    // a lone comma with exactly 1–2 decimals and no dots is a decimal comma even in a dot column ("12,5")
    if (!s.includes('.') && /^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  }
  if ((s.match(/\./g) ?? []).length > 1) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export function currencyOf(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values.slice(0, 400)) {
    const s = String(v);
    let hit: string | null = null;
    const code = s.match(/\b([A-Z]{3})\b/);
    if (code && CURRENCY_CODES.has(code[1])) hit = code[1];
    else for (const [re, c] of SYMBOLS) if (re.test(s)) { hit = c; break; }
    if (hit) counts.set(hit, (counts.get(hit) ?? 0) + 1);
  }
  let best: string | null = null, n = 0;
  for (const [c, k] of counts) if (k > n) { best = c; n = k; }
  return best;
}

/* ------------------------------------------------------------------ dates */

const MONTHS: Record<string, number> = {};
['january,jan,enero,ene,janvier,janv,januar,gennaio,gen,janeiro', 'february,feb,febrero,fevrier,fevr,fev,februar,febbraio,fevereiro', 'march,mar,marzo,mars,marz,marco', 'april,apr,abril,abr,avril,avr,aprile',
  'may,mayo,mai,maggio,mag,maio', 'june,jun,junio,juin,juni,giugno,giu,junho', 'july,jul,julio,juillet,juil,juli,luglio,lug,julho', 'august,aug,agosto,ago,aout,aou',
  'september,sep,sept,septiembre,septembre,settembre,set,setembro', 'october,oct,octubre,octobre,oktober,okt,ottobre,ott,outubro,out', 'november,nov,noviembre,novembre,novembro', 'december,dec,diciembre,dic,decembre,dezember,dez,dicembre,dezembro']
  .forEach((names, i) => names.split(',').forEach((n) => { MONTHS[n] = i + 1; }));

const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Which way round are slash dates in this column? Decided from all values: a first number >12 means day first. */
export function detectDateOrder(values: string[]): { order: DateOrder; assumed: boolean } | null {
  let dmy = 0, mdy = 0, numeric = 0;
  for (const v of values) {
    const m = String(v).trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
    if (!m) continue;
    numeric++;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (!numeric) return null;
  if (dmy && !mdy) return { order: 'dmy', assumed: false };
  if (mdy && !dmy) return { order: 'mdy', assumed: false };
  if (dmy && mdy) return { order: dmy >= mdy ? 'dmy' : 'mdy', assumed: true };
  return { order: 'mdy', assumed: true };
}

/** Reads one date into YYYY-MM-DD, keeping the calendar day as written (no timezone shifting). */
export function parseDate(raw: unknown, order: DateOrder = 'mdy', allowSerial = false): string | null {
  if (blank(raw)) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s,])/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:$|[T\s,])/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (order === 'dmy') return iso(y, b, a) ?? iso(y, a, b);
    return iso(y, a, b) ?? iso(y, b, a);
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m && +m[1] >= 1990) return iso(+m[1], +m[2], +m[3]);
  // "01-Dec-2009", "1 Dec 2009", "Tue, 01 Dec 2009 10:00"
  m = s.match(/^(?:[a-z]{3,9},?\s+)?(\d{1,2})(?:st|nd|rd|th)?[\s\-./]+([a-zA-ZÀ-ſ]{3,10})\.?[\s\-./,]+(\d{2,4})\b/i);
  if (m) { const mo = MONTHS[norm(m[2])]; if (mo) return iso(+m[3], mo, +m[1]); }
  // "Dec 1, 2009", "December 1st 2009", "Tuesday, December 1, 2009"
  m = s.match(/^(?:[a-z]{3,9},?\s+)?([a-zA-ZÀ-ſ]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})\b/i);
  if (m) { const mo = MONTHS[norm(m[1])]; if (mo) return iso(+m[3], mo, +m[2]); }
  const mh = monthHeader(s);
  if (mh) return mh; // "Oct 2026", "2026-10": a monthly figure, dated the 1st
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (allowSerial && n > 25000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000); return d.toISOString().slice(0, 10); }
    if (n > 9.4e8 && n < 2.2e9) return new Date(n * 1000).toISOString().slice(0, 10);
    if (n > 9.4e11 && n < 2.2e12) return new Date(n).toISOString().slice(0, 10);
  }
  return null;
}

/** "Jan 2024", "2024-01", "01/2024", "January", "Jan-24" as a month header → first day of that month. */
function monthHeader(h: string, fallbackYear?: number): string | null {
  const s = h.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], 1);
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return iso(+m[2], +m[1], 1);
  m = s.match(/^([a-zA-Z]{3,9})\.?[\s\-'/]*(\d{2,4})$/);
  if (m && MONTHS[norm(m[1])]) return iso(+m[2], MONTHS[norm(m[1])], 1);
  m = s.match(/^(\d{4})[\s\-]+([a-zA-Z]{3,9})$/);
  if (m && MONTHS[norm(m[2])]) return iso(+m[1], MONTHS[norm(m[2])], 1);
  if (fallbackYear && MONTHS[norm(s)] && s.length >= 3) return iso(fallbackYear, MONTHS[norm(s)], 1);
  return null;
}

/* ------------------------------------------------------------------ table */

export interface Table { headers: string[]; rows: string[][]; lines: number[]; delimiter: string; headerLine: number; droppedTotals: number[]; notes: number[]; how?: string; totalLines?: number; secondTable?: { line: number; label: string } }

/** Looks like a data value rather than a column name ("Jan 2026" and "2025" can be either, so they count as names). */
const isDataCell = (c: string) => (parseNumber(c) !== null && !/^(19|20)\d{2}$/.test(c.trim())) || (parseDate(c) !== null && !monthHeader(c));

const TOTAL_RE = /^(grand\s*|sub\s*|overall\s*)?(totals?|summe|gesamt(summe)?|gesamtbetrag|totale|totaal|somme|suma|sum|total general|total geral|importe total|totalt|yhteensa|razem|celkem)\s*:?\s*$|^total\s+(sales|revenue|amount|for .*)$/i;

export function readTable(text: string, limit?: number): Table {
  const clean = text.replace(/^﻿/, '').replace(/\u0000/g, '');
  const parsed = Papa.parse(clean, { delimitersToGuess: [',', ';', '\t', '|'], skipEmptyLines: false, ...(limit ? { preview: limit + 200 } : {}) });
  // Stopped early on a huge file: estimate the full size from its line count, so the person is told.
  let totalLines: number | undefined;
  if (limit && (parsed.data as unknown[]).length >= limit + 200) { totalLines = 0; for (let i = 0; i < clean.length; i++) if (clean.charCodeAt(i) === 10) totalLines++; }
  // Trim in place and keep only indices of non-empty lines: no extra copies of a possibly huge table.
  const all = parsed.data as string[][];
  const delimiter = parsed.meta.delimiter || ',';
  const idx: number[] = [];
  for (let i = 0; i < all.length; i++) { const r = all[i]; let any = false; for (let j = 0; j < r.length; j++) { const c = r[j] == null ? '' : String(r[j]).trim(); r[j] = c; if (c) any = true; } if (any) idx.push(i); }
  const nonEmpty = { length: idx.length, at: (k: number) => ({ r: all[idx[k]], i: idx[k] }) };
  if (!nonEmpty.length) throw new IngestError('EMPTY', 'The file is empty.');
  // Typical width = most common count of filled cells among the first 200 non-empty rows.
  const widths = new Map<number, number>();
  for (let k = 0; k < Math.min(200, nonEmpty.length); k++) { const { r } = nonEmpty.at(k); const w = r.filter((c) => c !== '').length; widths.set(w, (widths.get(w) ?? 0) + 1); }
  const typical = [...widths.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  // Header = first row (within the first 40) that is mostly labels and about as wide as the data under it.
  let h = 0;
  for (let k = 0; k < Math.min(40, nonEmpty.length); k++) {
    const cells = nonEmpty.at(k).r.filter((c) => c !== '');
    const labels = cells.filter((c) => !isDataCell(c) && c.length <= 80).length;
    if (cells.length >= Math.max(2, Math.floor(typical * 0.6)) && labels / cells.length >= 0.7) { h = k; break; }
    if (k === Math.min(40, nonEmpty.length) - 1) h = 0;
  }
  // No row looks like column names (the file starts straight with data): name the columns and keep that row as data.
  const firstCells = nonEmpty.at(h).r.filter((c) => c !== '');
  const headerless = firstCells.filter(isDataCell).length / Math.max(1, firstCells.length) >= 0.4;
  const widest = Math.max(...Array.from({ length: Math.min(50, nonEmpty.length) }, (_, k) => nonEmpty.at(k).r.length));
  const synth = Array.from({ length: widest }, (_, j) => `Column ${j < 26 ? String.fromCharCode(65 + j) : j + 1}`);
  const headerRow = headerless ? synth : nonEmpty.at(h).r;
  let width = headerRow.length;
  while (width > 1 && headerRow[width - 1] === '' && !Array.from({ length: Math.min(49, nonEmpty.length - h - 1) }, (_, k) => nonEmpty.at(h + 1 + k).r).some((r) => (r[width - 1] ?? '') !== '')) width--;
  const seen = new Map<string, number>();
  const headers = headerRow.slice(0, width).map((c, i) => {
    let name = c.replace(/\s+/g, ' ').trim() || `Column ${i + 1}`;
    const k = norm(name) || name; const n = (seen.get(k) ?? 0) + 1; seen.set(k, n);
    if (n > 1) name = `${name} ${n}`;
    return name;
  });
  const rows: string[][] = [], lines: number[] = [], droppedTotals: number[] = [], notes: number[] = [];
  let secondTable: { line: number; label: string } | undefined;
  const hnorm = headers.map((c) => norm(c)).join('|'), hset = new Set(headers.map((c) => norm(c)).filter(Boolean));
  for (let k = headerless ? h : h + 1; k < nonEmpty.length; k++) {
    const { r, i } = nonEmpty.at(k);
    if (r.length !== headers.length) { r.length = headers.length; for (let j = 0; j < r.length; j++) if (r[j] === undefined) r[j] = ''; }
    const row = r;
    all[i] = null as any; // the row now lives in `rows`; let the parser's copy go
    if (row.every((c) => c === '')) continue;
    const filled = row.filter((c) => c !== '');
    // Header repeated (page breaks in PDFs, stacked exports), even if a heading or two went missing.
    if (filled.length >= 2 && filled.filter((c) => hset.has(norm(c))).length >= Math.max(2, Math.ceil(filled.length * 0.6))) continue;
    if (filled.length === 1 && headers.length >= 3 && parseNumber(filled[0]) === null) { notes.push(i + 1); continue; } // "Page 2 of 5", notes, section titles
    // A new set of column headings further down = a second table (e.g. a summary). Read only the first.
    if (rows.length && filled.length >= 2 && filled.every((c) => !isDataCell(c)) && filled.filter((c) => ROLES.some((role) => nameScore(role, c) >= 0.7)).length >= 2 && row.map((c) => norm(c)).join('|') !== hnorm) { secondTable = { line: i + 1, label: filled.slice(0, 3).join(', ') }; break; }
    if (row.slice(0, 3).some((c) => TOTAL_RE.test(c))) { droppedTotals.push(i + 1); continue; }
    rows.push(row); lines.push(i + 1);
  }
  // Drop columns that are empty everywhere.
  const keep = headers.map((_, j) => rows.some((r) => r[j] !== ''));
  const headerLine = headerless ? 0 : nonEmpty.at(h).i + 1;
  if (keep.every(Boolean)) return { headers, rows, lines, delimiter, headerLine, droppedTotals, notes, totalLines, secondTable };
  return { headers: headers.filter((_, j) => keep[j]), rows: rows.map((r) => r.filter((_, j) => keep[j])), lines, delimiter, headerLine, droppedTotals, notes, totalLines, secondTable };
}

/** One column per month (a pivot/crosstab, e.g. from Tableau) → one row per item per month. */
function unpivotMonths(t: Table): Table | null {
  const yearHint = t.headers.map((x) => x.match(/\b(19|20)\d{2}\b/)?.[0]).find(Boolean);
  const monthCols = t.headers.map((x, j) => ({ j, d: monthHeader(x, yearHint ? +yearHint : undefined) })).filter((x) => x.d);
  if (monthCols.length < 3 || monthCols.length < t.headers.length * 0.4) return null;
  const numericShare = monthCols.reduce((s, { j }) => s + t.rows.filter((r) => r[j] === '' || parseNumber(r[j]) !== null).length, 0) / (monthCols.length * Math.max(1, t.rows.length));
  if (numericShare < 0.9) return null;
  const idCols = t.headers.map((_, j) => j).filter((j) => !monthCols.some((m) => m.j === j));
  const headers = [...idCols.map((j) => t.headers[j]), 'Month', 'Amount'];
  const rows: string[][] = [], lines: number[] = [];
  t.rows.forEach((r, i) => { for (const { j, d } of monthCols) if (r[j] !== '') { rows.push([...idCols.map((k) => r[k]), d!, r[j]]); lines.push(t.lines[i]); } });
  return { ...t, headers, rows, lines, how: `one column per month (${monthCols.length} months), turned into rows` };
}

/* ------------------------------------------------------------------ platforms */

interface Profile { id: string; label: string; detect: string[]; roles: Partial<Record<Role, string[]>>; orderLevel?: Role[] }
const PROFILES: Profile[] = [
  { id: 'shopify', label: 'Shopify order export', detect: ['name', 'createdat', 'lineitemname', 'lineitemquantity', 'lineitemprice'],
    roles: { date: ['createdat', 'paidat'], order: ['name'], product: ['lineitemname'], sku: ['lineitemsku'], quantity: ['lineitemquantity'], price: ['lineitemprice'], customer: ['email', 'billingname'], country: ['shippingcountry', 'billingcountry'], region: ['shippingprovincename', 'shippingprovince', 'billingprovince'], status: ['financialstatus'], currency: ['currency'], discount: ['discountamount'], refund: ['refundedamount'], category: ['vendor'], cancelled: ['cancelledat'] },
    orderLevel: ['date', 'customer', 'country', 'region', 'status', 'currency', 'discount', 'refund', 'cancelled'] },
  { id: 'amazon', label: 'Amazon order report', detect: ['amazonorderid', 'purchasedate'],
    roles: { date: ['purchasedate'], order: ['amazonorderid'], product: ['productname'], sku: ['sku', 'asin'], quantity: ['quantity', 'quantitypurchased'], amount: ['itemprice'], customer: ['buyeremail', 'buyername'], country: ['shipcountry'], region: ['shipstate'], status: ['orderstatus', 'itemstatus'], currency: ['currency'], discount: ['itempromotiondiscount'] } },
  { id: 'etsy', label: 'Etsy sold order items', detect: ['saledate', 'itemname'],
    roles: { date: ['saledate', 'datepaid'], order: ['orderid'], product: ['itemname'], sku: ['sku'], quantity: ['quantity'], price: ['price'], amount: ['itemtotal'], customer: ['buyer', 'buyerusername'], country: ['shipcountry'], region: ['shipstate'], currency: ['currency'], discount: ['discountamount'], status: ['orderstatus'] } },
  { id: 'square', label: 'Square item sales', detect: ['transactionid', 'item', 'netsales'],
    roles: { date: ['date'], order: ['transactionid'], product: ['item'], sku: ['sku'], quantity: ['qty', 'count'], amount: ['netsales'], customer: ['customername', 'customerid'], status: ['eventtype'], category: ['category'], discount: [] } },
  { id: 'woocommerce', label: 'WooCommerce orders', detect: ['netsales', 'itemssold'],
    roles: { date: ['date', 'orderdate'], order: ['order', 'ordernumber', 'orderid'], product: ['products', 'product'], quantity: ['itemssold'], amount: ['netsales'], customer: ['customer', 'customername'], status: ['status'] } },
  { id: 'stripe', label: 'Stripe payments', detect: ['createddateutc', 'amountrefunded'],
    roles: { date: ['createddateutc'], order: ['id'], product: ['description'], amount: ['amount'], customer: ['customeremail', 'customerid', 'customerdescription'], status: ['status'], currency: ['currency'], refund: ['amountrefunded'], country: ['cardissuecountry'] } },
  { id: 'uci', label: 'Store transaction log', detect: ['invoice', 'stockcode', 'description', 'quantity', 'price'],
    roles: { date: ['invoicedate'], order: ['invoice', 'invoiceno'], product: ['description'], sku: ['stockcode'], quantity: ['quantity'], price: ['price', 'unitprice'], customer: ['customerid'], country: ['country'] } },
  { id: 'uci', label: 'Store transaction log', detect: ['invoiceno', 'stockcode', 'description', 'quantity', 'unitprice'],
    roles: { date: ['invoicedate'], order: ['invoiceno'], product: ['description'], sku: ['stockcode'], quantity: ['quantity'], price: ['unitprice'], customer: ['customerid'], country: ['country'] } },
];

/* ------------------------------------------------------------------ generic role detection */

const NAMES: Record<Role, { exact: string[]; contains: string[]; not?: string[] }> = {
  date: { exact: ['date', 'orderdate', 'saledate', 'createdat', 'created', 'paidat', 'purchasedate', 'invoicedate', 'transactiondate', 'datetime', 'timestamp', 'day', 'month', 'period', 'fecha', 'datum', 'data', 'dateofsale', 'orderedat', 'placedat'], contains: ['date', 'created', 'time', 'fecha', 'datum'], not: ['ship', 'deliver', 'fulfil', 'update', 'cancel', 'refund', 'birth', 'due', 'expir'] },
  order: { exact: ['order', 'orderid', 'ordernumber', 'orderno', 'ordername', 'invoice', 'invoiceid', 'invoiceno', 'invoicenumber', 'transactionid', 'transaction', 'receipt', 'receiptnumber', 'receiptid', 'salesorder', 'saleid', 'pedido', 'numeropedido', 'bestellnummer', 'bestellung', 'rechnungsnummer', 'auftragsnummer', 'commande', 'numerocommande', 'facture', 'factura', 'ordine', 'bestelling'], contains: ['orderid', 'ordernum', 'orderno', 'invoice', 'transactionid', 'receipt'], not: ['date', 'status', 'total', 'line'] },
  product: { exact: ['product', 'productname', 'producttitle', 'item', 'itemname', 'itemtitle', 'description', 'title', 'name', 'lineitemname', 'products', 'article', 'articulo', 'artikel', 'artikelname', 'bezeichnung', 'produktname', 'produkt', 'produit', 'producto', 'prodotto', 'produto', 'designation', 'libelle', 'descripcion', 'service', 'variant', 'goods', 'merchandise'], contains: ['product', 'itemname', 'item', 'description', 'title'], not: ['id', 'type', 'category', 'sku', 'code', 'quantity', 'qty', 'price', 'count', 'vendor', 'customer'] },
  sku: { exact: ['sku', 'stockcode', 'productid', 'itemcode', 'productcode', 'variantsku', 'asin', 'upc', 'barcode', 'ean', 'itemid', 'partnumber'], contains: ['sku', 'stockcode', 'productcode', 'itemcode', 'barcode'] },
  quantity: { exact: ['quantity', 'qty', 'units', 'unitssold', 'itemssold', 'count', 'pieces', 'pcs', 'cantidad', 'menge', 'anzahl', 'stuck', 'quantite', 'qte', 'quantita', 'quantidade', 'qtd', 'volume', 'numberofitems', 'aantal'], contains: ['quantity', 'qty', 'unitssold', 'itemssold'], not: ['price', 'refund', 'return'] },
  price: { exact: ['price', 'unitprice', 'itemprice', 'saleprice', 'priceeach', 'rate', 'precio', 'preciounitario', 'preis', 'einzelpreis', 'stuckpreis', 'prix', 'prixunitaire', 'prezzo', 'preco', 'sellingprice', 'prijs'], contains: ['unitprice', 'priceeach', 'price'], not: ['total', 'cost', 'compare', 'original', 'list', 'msrp', 'tax'] },
  amount: { exact: ['netsales', 'total', 'amount', 'sales', 'revenue', 'linetotal', 'itemtotal', 'ordertotal', 'subtotal', 'grosssales', 'totalsales', 'value', 'salesamount', 'totalamount', 'netamount', 'grandtotal', 'totalprice', 'importe', 'betrag', 'montant', 'valor', 'umsatz', 'ventas', 'income', 'turnover', 'paid', 'amountpaid', 'charged', 'net'], contains: ['netsales', 'total', 'amount', 'sales', 'revenue', 'importe', 'betrag', 'montant', 'umsatz'], not: ['tax', 'vat', 'shipping', 'discount', 'refund', 'fee', 'cost', 'tip', 'count', 'quantity', 'qty', 'items', 'id', 'number', 'orders', 'customers'] },
  customer: { exact: ['customer', 'customerid', 'customername', 'customeremail', 'email', 'buyer', 'buyername', 'buyeremail', 'client', 'clientid', 'clientname', 'billingname', 'purchaser', 'user', 'userid', 'member', 'cliente', 'kunde', 'kundenname', 'kundennummer', 'shopper', 'account', 'contact', 'klant', 'acheteur'], contains: ['customer', 'buyer', 'client', 'email', 'kunde', 'cliente'], not: ['type', 'note', 'group', 'segment', 'since', 'count', 'phone'] },
  country: { exact: ['country', 'shipcountry', 'shippingcountry', 'billingcountry', 'countrycode', 'nation', 'pais', 'land', 'pays', 'paese', 'market'], contains: ['country', 'pais'] },
  region: { exact: ['state', 'province', 'region', 'shipstate', 'shippingprovince', 'shippingprovincename', 'billingprovince', 'county', 'territory', 'area', 'city', 'location', 'store', 'branch'], contains: ['state', 'province', 'region'], not: ['status', 'statement'] },
  status: { exact: ['status', 'orderstatus', 'financialstatus', 'paymentstatus', 'eventtype', 'type', 'transactiontype', 'state', 'estado'], contains: ['status'], not: ['fulfil', 'ship'] },
  currency: { exact: ['currency', 'currencycode', 'moneda', 'wahrung', 'devise', 'valuta'], contains: ['currency'] },
  discount: { exact: ['discount', 'discounts', 'discountamount', 'promotion', 'coupon', 'couponamount', 'markdown', 'descuento', 'rabatt', 'remise'], contains: ['discount'], not: ['code', 'name', 'rate', 'percent', 'pct'] },
  refund: { exact: ['refund', 'refunds', 'refunded', 'refundedamount', 'amountrefunded', 'refundamount', 'returns', 'returnamount'], contains: ['refund'] },
  cost: { exact: ['cost', 'unitcost', 'costprice', 'costperitem', 'cogs', 'productcost', 'itemcost', 'purchaseprice', 'buyprice', 'wholesale', 'wholesaleprice', 'costo', 'kosten'], contains: ['cost', 'cogs'], not: ['shipping', 'total'] },
  profit: { exact: ['profit', 'grossprofit', 'netprofit', 'margin', 'earnings'], contains: ['profit'], not: ['percent', 'pct', 'rate'] },
  category: { exact: ['category', 'productcategory', 'type', 'producttype', 'department', 'collection', 'vendor', 'brand', 'channel', 'saleschannel', 'source', 'segment', 'group', 'categoria', 'kategorie', 'line', 'productline'], contains: ['category', 'department', 'channel', 'brand', 'vendor'], not: ['id', 'code'] },
  cancelled: { exact: ['cancelledat', 'canceledat', 'cancelled', 'canceled', 'cancelleddate'], contains: ['cancel'] },
};
const MONEY: Role[] = ['amount', 'price', 'discount', 'refund', 'cost', 'profit'];

interface ColStats { email: number; percent: number; numeric: number; integer: number; date: number; serial: number; distinct: number; country: number; code3: number; avgLen: number; n: number; status: number; negatives: number }
function colStats(values: string[]): ColStats {
  const v = values.filter((x) => !blank(x)).slice(0, 600);
  const n = v.length || 1, dc = detectDecimalComma(v);
  const nums = v.map((x) => parseNumber(x, dc));
  const order = detectDateOrder(v)?.order ?? 'mdy';
  return {
    percent: v.filter((x) => /%\s*$/.test(x)).length / n,
    email: v.filter((x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x.trim())).length / n,
    n: v.length,
    numeric: nums.filter((x) => x !== null).length / n,
    integer: nums.filter((x) => x !== null && Number.isInteger(x)).length / n,
    negatives: nums.filter((x) => x !== null && x < 0).length / n,
    date: v.filter((x) => parseDate(x, order) !== null && !/^\d{1,6}(\.\d+)?$/.test(x.trim()) && !/^\d{4}$/.test(x.trim())).length / n,
    serial: v.filter((x) => /^\d{5}(\.\d+)?$/.test(x.trim()) && +x > 25000 && +x < 80000).length / n,
    distinct: new Set(v).size,
    country: v.filter((x) => COUNTRIES.has(x.trim().toLowerCase())).length / n,
    code3: v.filter((x) => CURRENCY_CODES.has(x.trim().toUpperCase())).length / n,
    status: v.filter((x) => STATUS_DROP.test(x) || STATUS_RETURN.test(x) || STATUS_REFUNDED.test(x) || /^(paid|complete|completed|shipped|delivered|processing|pending|authorized|succeeded|payment|sale|fulfilled|partially\s*refunded|open|closed)$/i.test(x.trim())).length / n,
    avgLen: v.reduce((s, x) => s + x.length, 0) / n,
  };
}

/** Words in a header: "Total Paid" → total, paid; "customerID" → customer, id; "ship_country" → ship, country. */
const words = (h: string) => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Header keywords in scripts that have no Latin letters (Japanese, Chinese, Korean, Russian, Arabic). */
const NATIVE: Partial<Record<Role, RegExp>> = {
  date: /日付|日期|注文日|購入日|날짜|일자|дата|تاريخ/iu, order: /注文番号|注文ID|订单号|订单编号|订单|주문번호|номер заказа|заказ|رقم الطلب/iu, product: /商品|产品|製品|品名|品目|상품|제품|товар|продукт|наименование|منتج/iu,
  customer: /顧客|客户|お客様|購入者|고객|구매자|клиент|покупатель|عميل/iu, quantity: /数量|個数|수량|количество|кол-во|كمية/iu, price: /単価|单价|단가|цена|سعر/iu,
  amount: /金額|金额|売上|销售额|合計|总计|小計|금액|매출|합계|сумма|выручка|итого|المبلغ|الإجمالي/iu, country: /国|国家|국가|страна|البلد|الدولة/iu, cost: /原価|成本|원가|себестоимость|التكلفة/iu,
};

function nameScore(role: Role, h: string): number {
  const k = norm(h), spec = NAMES[role];
  if (!k) return NATIVE[role]?.test(h) ? 0.9 : 0;
  const w = words(h);
  if (spec.exact.includes(k)) return 1;
  if (spec.not?.some((t) => w.some((x) => x.startsWith(t)))) return 0;
  if (spec.contains.some((t) => k.includes(t))) return 0.7;
  if (NATIVE[role]?.test(h)) return 0.9;
  return 0;
}

/** Do the values suit the role? A clearly named column gets more slack, so a few bad cells are reported rather than the column being ignored. */
function fits(role: Role, s: ColStats, rows: number, named = false): boolean {
  if (!s.n) return false;
  const k = named ? 0.6 : 1;
  switch (role) {
    case 'date': return s.date >= 0.7 * k || (named && s.serial >= 0.9);
    case 'quantity': return s.numeric >= 0.9 * k && s.integer >= 0.85 * k;
    case 'amount': case 'price': case 'cost': case 'profit': return s.numeric >= 0.85 * k && s.percent < 0.3;
    case 'discount': case 'refund': return s.numeric >= 0.85 * k && s.percent < 0.3;
    case 'currency': return s.code3 >= 0.8;
    case 'country': return s.numeric < 0.2;
    case 'status': return s.numeric < 0.2 && s.distinct <= 40;
    case 'category': return s.numeric < 0.3 && s.distinct >= 2 && s.distinct <= Math.max(60, rows * 0.05);
    case 'cancelled': return true;
    case 'product': return s.numeric < 0.5 && s.distinct >= (named ? 1 : 2);
    case 'customer': return s.distinct >= (named ? 1 : 2);
    case 'order': return s.distinct >= (named ? 1 : 2);
    default: return true;
  }
}

function detectRoles(t: Table, profile: Profile | null, overrides: Partial<Record<Role, string | null>>): { roles: RoleMap; confidence: Partial<Record<Role, number>> } {
  const roles: RoleMap = {}, confidence: Partial<Record<Role, number>> = {}, used = new Set<string>();
  const byNorm = new Map(t.headers.map((h) => [norm(h), h]));
  const stats = new Map(t.headers.map((h, j) => [h, colStats(t.rows.map((r) => r[j]))]));
  for (const [role, col] of Object.entries(overrides) as [Role, string | null][]) {
    if (col === null) { used.add(`__none_${role}`); continue; }
    if (t.headers.includes(col)) { roles[role] = col; confidence[role] = 1; used.add(col); }
  }
  const skip = (role: Role) => roles[role] !== undefined || used.has(`__none_${role}`);
  if (profile) for (const [role, names] of Object.entries(profile.roles) as [Role, string[]][]) {
    if (skip(role)) continue;
    const col = names.map((n) => byNorm.get(n)).find((c) => c && !used.has(c));
    if (col) { roles[role] = col; confidence[role] = 0.99; used.add(col); }
  }
  // Score every (role, column) pair: name evidence + whether the values look right.
  const cand: { role: Role; col: string; score: number }[] = [];
  // A recognised platform's own map is authoritative; only look for extras it doesn't define (e.g. costs).
  const open: Role[] = profile ? ['cost', 'profit'] : [...ROLES];
  for (const role of open) {
    if (skip(role)) continue;
    for (const col of t.headers) {
      if (used.has(col)) continue;
      const s = stats.get(col)!;
      let ns = nameScore(role, col);
      if (!fits(role, s, t.rows.length, ns === 1)) continue;
      // Value-only evidence for a few roles when the header says nothing.
      if (!ns) {
        if (role === 'date' && s.date >= 0.95) ns = 0.55;
        else if (role === 'country' && s.country >= 0.8) ns = 0.6;
        else if (role === 'currency' && s.code3 >= 0.95) ns = 0.6;
        else if (role === 'status' && s.status >= 0.8) ns = 0.5;
        else if (role === 'customer' && s.email >= 0.8) ns = 0.6;
      }
      if (role === 'country' && ns && s.country < 0.3 && nameScore('country', col) < 1) ns *= 0.6;
      if (role === 'quantity' && ns < 1 && s.integer < 0.98) ns *= 0.8;
      if (!ns) continue;
      cand.push({ role, col, score: ns * 0.8 + 0.2 });
    }
  }
  // Prefer specific money names: "net sales" beats "gross sales" beats a bare "total".
  const amountRank = ['netsales', 'linetotal', 'itemtotal', 'netamount', 'sales', 'revenue', 'amount', 'total', 'totalprice', 'ordertotal', 'subtotal', 'grosssales'];
  for (const c of cand) if (c.role === 'amount') { const i = amountRank.indexOf(norm(c.col)); if (i >= 0) c.score += (amountRank.length - i) * 0.002; }
  cand.sort((a, b) => b.score - a.score);
  for (const c of cand) {
    if (skip(c.role) || used.has(c.col) || c.score < 0.45) continue;
    roles[c.role] = c.col; confidence[c.role] = Math.min(0.97, c.score); used.add(c.col);
  }
  // A column named like a price but holding line totals (price ≈ amount / qty) — keep both only if they differ.
  // Fallback money: no named money column → the numeric, mostly non-integer column with the widest spread.
  // Fallback product: the most varied remaining text column (shown to the person to confirm).
  if (!roles.product && !used.has('__none_product') && !profile) {
    const pick = t.headers.filter((h) => !used.has(h)).map((h) => ({ h, s: stats.get(h)! }))
      .filter(({ s, h }) => s.numeric < 0.2 && s.date < 0.2 && s.country < 0.5 && s.code3 < 0.5 && s.status < 0.5 && s.email < 0.5 && s.distinct >= 2 && s.avgLen >= 3 && s.avgLen <= 80 && !/email|phone|address|zip|postal|note|comment|tag|url|link/i.test(h))
      // products repeat across sales more than customers or notes do: prefer the column whose values repeat most (but not a 2-value flag)
      .sort((a, b) => { const flag = (x: ColStats) => (t.rows.length >= 30 && x.distinct < 3 ? 1 : 0); return flag(a.s) - flag(b.s) || a.s.distinct - b.s.distinct; })[0];
    if (pick) { roles.product = pick.h; confidence.product = 0.45; used.add(pick.h); }
  }
  if (!roles.amount && !roles.price && !used.has('__none_amount') && !used.has('__none_price') && !profile) {
    const pick = t.headers.filter((h) => !used.has(h)).map((h) => ({ h, s: stats.get(h)! })).filter(({ s, h }) => s.numeric >= 0.95 && s.integer < 0.9 && !/id|code|zip|postal|phone|year|lat|lon/i.test(h))
      .sort((a, b) => (1 - b.s.integer) - (1 - a.s.integer))[0];
    if (pick) { roles.amount = pick.h; confidence.amount = 0.4; used.add(pick.h); }
  }
  // Unnamed quantity: a column of small whole numbers that isn't a running ID.
  if (!roles.quantity && !used.has('__none_quantity') && !profile) {
    const pick = t.headers.filter((h) => !used.has(h)).find((h) => {
      const j = t.headers.indexOf(h), s = stats.get(h)!;
      if (s.numeric < 0.95 || s.integer < 0.98 || /id|code|zip|postal|phone|year|no$|number|#/i.test(h)) return false;
      const v = t.rows.slice(0, 500).map((r) => parseNumber(r[j])).filter((x): x is number => x !== null);
      const max = Math.max(...v), min = Math.min(...v);
      let rising = 0; for (let i = 1; i < v.length; i++) if (v[i] > v[i - 1]) rising++;
      return max <= 1000 && min >= -1000 && new Set(v).size <= 60 && rising < v.length * 0.9;
    });
    if (pick) { roles.quantity = pick; confidence.quantity = 0.45; used.add(pick); }
  }
  // A guessed money column next to a quantity: unit price or line total? If a product's amount stays the same
  // whatever the quantity, it's a unit price.
  if (roles.amount && roles.quantity && !roles.price && (confidence.amount ?? 1) < 0.9 && roles.product) {
    const ja = t.headers.indexOf(roles.amount), jq = t.headers.indexOf(roles.quantity), jp = t.headers.indexOf(roles.product);
    const byP = new Map<string, Set<string>>(), qtyVaries = new Map<string, Set<string>>();
    for (const r of t.rows.slice(0, 3000)) { (byP.get(r[jp]) ?? byP.set(r[jp], new Set()).get(r[jp])!).add(r[ja]); (qtyVaries.get(r[jp]) ?? qtyVaries.set(r[jp], new Set()).get(r[jp])!).add(r[jq]); }
    const groups = [...byP.keys()].filter((p) => qtyVaries.get(p)!.size >= 2);
    if (groups.length && groups.filter((p) => byP.get(p)!.size === 1).length / groups.length >= 0.7) { roles.price = roles.amount; confidence.price = confidence.amount; delete roles.amount; delete confidence.amount; }
  }
  return { roles, confidence };
}

/* ------------------------------------------------------------------ records → lines */

interface Rec { line: number; file: number; v: Partial<Record<Role, string>>; extra: Record<string, string> }

function toRecords(t: Table, roles: RoleMap, file: number, orderLevel: Role[], extras: string[]): Rec[] {
  const idx = Object.fromEntries(Object.entries(roles).map(([r, c]) => [r, t.headers.indexOf(c!)])) as Partial<Record<Role, number>>;
  const ex = extras.map((h) => [h, t.headers.indexOf(h)] as const);
  const out: Rec[] = [];
  let last: Rec | null = null;
  // Order-level fields are often written only on an order's first line: carry them down within the same order.
  const carry: Role[] = orderLevel.length ? orderLevel : ['date', 'customer', 'country', 'region', 'status', 'currency'];
  t.rows.forEach((r, i) => {
    const v: Partial<Record<Role, string>> = {};
    for (const role of ROLES) { const j = idx[role]; if (j !== undefined && j >= 0 && !blank(r[j])) v[role] = r[j]; }
    for (const role of ['order', 'customer', 'sku'] as Role[]) if (v[role]) v[role] = v[role]!.replace(/^(\d+)\.0+$/, '$1'); // Excel turns 1001 into 1001.0
    const rec: Rec = { line: t.lines[i], file, v, extra: Object.fromEntries(ex.map(([h, j]) => [h, r[j] ?? ''])) };
    // Some exports leave the order number (and date) blank on an order's extra lines.
    if (last && roles.order && !v.order && !v.date && last.v.order && (v.product || v.sku)) v.order = last.v.order;
    if (last && roles.order && v.order && last.v.order === v.order) for (const role of carry) if (v[role] === undefined && last.v[role] !== undefined) v[role] = last.v[role];
    out.push(rec); last = rec;
  });
  return out;
}

/** Split "2× Hoodie, 1× Cap" (WooCommerce and others) into separate products with quantities. */
function explodeMulti(product: string): { name: string; qty: number }[] | null {
  const parts = product.split(/,\s*(?=\d+\s*[×x]\s)/);
  const items = parts.map((p) => p.trim().match(/^(\d+)\s*[×x]\s+(.+)$/)).filter(Boolean) as RegExpMatchArray[];
  if (!items.length || items.length !== parts.length) return null;
  return items.map((m) => ({ name: m[2].trim(), qty: +m[1] }));
}

/* ------------------------------------------------------------------ main */

export interface IngestInput { name: string; text: string }
export interface IngestOptions { overrides?: Partial<Record<Role, string | null>>; dateOrder?: DateOrder; maxRows?: number; /** The person's answer when the file doesn't state its currency. */ currency?: string }

interface Parsed { name: string; table: Table; profile: Profile | null; roles: RoleMap; confidence: Partial<Record<Role, number>> }

function parseFile(f: IngestInput, overrides: Partial<Record<Role, string | null>> = {}, limit?: number): Parsed {
  let table = readTable(f.text, limit);
  if (!table.rows.length) throw new IngestError('TOO_FEW_ROWS', `${f.name}: found a header but no rows of data under it.`);
  const hn = new Set(table.headers.map(norm));
  let profile = PROFILES.find((p) => p.detect.every((d) => hn.has(d))) ?? null;
  if (!profile) { const u = unpivotMonths(table); if (u) table = u; }
  // Separate first/last name columns and nothing else identifies the customer: join them into one.
  if (!profile && !table.headers.some((h) => nameScore('customer', h) > 0)) {
    const first = table.headers.findIndex((h) => /^(first|given|fore)\s*_?name$|^vorname$|^prenom$|^nombre$/i.test(h.trim()));
    const last = table.headers.findIndex((h) => /^(last|family|sur)\s*_?name$|^surname$|^nachname$|^nom$|^apellidos?$/i.test(h.trim()));
    if (first >= 0 && last >= 0) {
      table.headers.push('Customer name');
      for (const r of table.rows) r.push(`${r[first]} ${r[last]}`.trim());
    }
  }
  const { roles, confidence } = detectRoles(table, profile, overrides);
  return { name: f.name, table, profile, roles, confidence };
}

export function ingest(files: IngestInput[], opts: IngestOptions = {}): { dataset: Dataset; report: IngestReport } {
  if (!files.length) throw new IngestError('EMPTY', 'No file was received.');
  const maxRows = opts.maxRows ?? 1_200_000;
  const primary = parseFile(files[0], opts.overrides, opts.maxRows);
  const { table, profile, roles } = primary;
  const issues: Issue[] = [];
  const kindOf = (name: string) => (/\.pdf$/i.test(name) ? 'PDF report' : /\.(xlsx|xlsm|xls|ods|numbers)$/i.test(name) ? 'Excel workbook' : 'Spreadsheet');
  const fileInfo: IngestReport['files'] = [{ name: primary.name, format: profile?.label ?? (table.how ? 'Summary table' : kindOf(primary.name)), rows: table.rows.length, delimiter: table.delimiter, headerLine: table.headerLine, how: table.how }];
  if (table.headerLine > 1) issues.push({ kind: 'title-rows', severity: 'info', count: table.headerLine - 1, lines: [], message: `Skipped ${table.headerLine - 1} line(s) above the column headers (titles or notes). Headers are on line ${table.headerLine}.` });
  if (table.secondTable) issues.push({ kind: 'second-table', severity: 'info', count: 1, lines: [table.secondTable.line], message: `A second table starts at line ${table.secondTable.line} (${table.secondTable.label}); only the first table, your sales, was read.` });
  if (table.notes.length) issues.push({ kind: 'notes', severity: 'info', count: table.notes.length, lines: table.notes.slice(0, 5), message: `Skipped ${table.notes.length} line(s) that were notes or page labels, not sales.` });
  if (table.droppedTotals.length) issues.push({ kind: 'totals', severity: 'info', count: table.droppedTotals.length, lines: table.droppedTotals.slice(0, 5), message: `Left out ${table.droppedTotals.length} total/summary line(s) so nothing is counted twice.` });

  const usedCols = new Set(Object.values(roles));
  const extras = table.headers.filter((h) => !usedCols.has(h)).filter((h) => {
    const s = colStats(table.rows.map((r) => r[table.headers.indexOf(h)]));
    return s.numeric < 0.3 && s.date < 0.3 && s.distinct >= 2 && s.distinct <= 40 && s.avgLen <= 40 && !/email|phone|address|zip|postal|note|tag|id$/i.test(h);
  }).slice(0, 5);
  // Exact copies: judged on the WHOLE original row. With order numbers, an identical row is a copy (removed);
  // without them, two identical rows may be two real purchases, so they're kept and flagged.
  let dupRows = 0;
  {
    const seen = new Set<string>(), keepRows: string[][] = [], keepLines: number[] = [], dupLines: number[] = [];
    table.rows.forEach((r, i) => { const k = r.join('\u0001'); if (seen.has(k)) { dupRows++; if (dupLines.length < 6) dupLines.push(table.lines[i]); if (!roles.order || profile?.id === 'uci') { keepRows.push(r); keepLines.push(table.lines[i]); } } else { seen.add(k); keepRows.push(r); keepLines.push(table.lines[i]); } });
    if (dupRows && roles.order && profile?.id !== 'uci') { table.rows = keepRows; table.lines = keepLines; issues.push({ kind: 'duplicates', severity: 'info', count: dupRows, lines: dupLines, message: `${dupRows.toLocaleString()} line(s) were exact copies of another line (every column identical) and were counted once.` }); }
    else if (dupRows && !roles.order) issues.push({ kind: 'possible-duplicates', severity: 'kept', count: dupRows, lines: dupLines, message: `${dupRows.toLocaleString()} line(s) are identical to another line. Without order numbers Blindspot can't tell a copy from a repeat purchase, so they're all counted. If they're copies, remove them and upload again.` });
  }
  let recs = toRecords(table, roles, 0, profile?.orderLevel ?? [], extras);

  // ---- extra files: append same-shaped exports, or fill missing details by a shared key
  for (let fi = 1; fi < files.length; fi++) {
    const p = parseFile(files[fi], {}, opts.maxRows);
    const same = p.table.headers.length && p.table.headers.filter((h) => table.headers.map(norm).includes(norm(h))).length / Math.max(p.table.headers.length, table.headers.length) >= 0.8;
    if (same) {
      const remapped = Object.fromEntries(Object.entries(roles).map(([r, c]) => [r, p.table.headers.find((h) => norm(h) === norm(c!))])) as RoleMap;
      const add = toRecords(p.table, remapped, fi, profile?.orderLevel ?? [], extras.filter((h) => p.table.headers.includes(h)));
      recs = recs.concat(add);
      fileInfo.push({ name: p.name, format: 'Added rows (same columns)', rows: p.table.rows.length, delimiter: p.table.delimiter, headerLine: p.table.headerLine, how: `${add.length.toLocaleString()} rows added to the first file` });
      continue;
    }
    const extraRecs = toRecords(p.table, p.roles, fi, [], []);
    const keys: Role[] = ['order', 'sku', 'product', 'customer'];
    let best: { key: Role; hit: number } | null = null;
    for (const key of keys) {
      if (!p.roles[key] || !roles[key]) continue;
      const have = new Set(recs.map((r) => r.v[key]?.trim().toLowerCase()).filter(Boolean));
      const vals = extraRecs.map((r) => r.v[key]?.trim().toLowerCase()).filter(Boolean) as string[];
      const hit = vals.length ? vals.filter((x) => have.has(x)).length / vals.length : 0;
      if (hit >= 0.3 && (!best || hit > best.hit)) best = { key, hit };
    }
    if (!best) {
      fileInfo.push({ name: p.name, format: 'Not merged', rows: p.table.rows.length, delimiter: p.table.delimiter, headerLine: p.table.headerLine, how: 'No order number, SKU, product or customer in common with the first file' });
      issues.push({ kind: 'merge-failed', severity: 'info', count: 1, lines: [], message: `${p.name} couldn't be matched to your sales: it shares no order numbers, SKUs, products or customers with the first file.` });
      continue;
    }
    const lookup = new Map<string, Rec>();
    for (const r of extraRecs) { const k = r.v[best.key]?.trim().toLowerCase(); if (k && !lookup.has(k)) lookup.set(k, r); }
    const fillable = (Object.keys(p.roles) as Role[]).filter((r) => r !== best!.key && !['order'].includes(r));
    let filled = 0;
    for (const rec of recs) {
      const m = lookup.get(rec.v[best.key]?.trim().toLowerCase() ?? '');
      if (!m) continue;
      let any = false;
      for (const role of fillable) if (rec.v[role] === undefined && m.v[role] !== undefined) { rec.v[role] = m.v[role]; any = true; }
      if (any) filled++;
    }
    for (const role of fillable) if (!roles[role]) roles[role] = `${p.roles[role]} (from ${p.name})`;
    fileInfo.push({ name: p.name, format: 'Merged details', rows: p.table.rows.length, delimiter: p.table.delimiter, headerLine: p.table.headerLine, how: `Matched by ${ROLE_LABEL[best.key].toLowerCase()} (${Math.round(best.hit * 100)}% matched); filled ${fillable.map((r) => ROLE_LABEL[r].toLowerCase()).join(', ')} on ${filled.toLocaleString()} rows` });
  }
  const fullSize = Math.max(recs.length, (table.totalLines ?? 0) - table.headerLine);
  if (fullSize > maxRows) {
    issues.push({ kind: 'trimmed', severity: 'dropped', count: fullSize - maxRows, lines: [], message: `The file has about ${fullSize.toLocaleString()} rows; the first ${maxRows.toLocaleString()} were analysed. Export a shorter date range (or split it into files) for the rest.` });
    if (recs.length > maxRows) recs.length = maxRows;
  }
  table.rows = []; // records hold everything needed from here on

  // ---- how to read numbers and dates (decided per column from all values)
  const col = (role: Role) => recs.map((r) => r.v[role]).filter((x): x is string => x !== undefined);
  const euroHint = table.delimiter === ';' || /€/.test(col('amount').concat(col('price')).slice(0, 200).join(' '));
  const dc: Partial<Record<Role, boolean>> = {};
  for (const role of [...MONEY, 'quantity'] as Role[]) dc[role] = detectDecimalComma(col(role), euroHint);

  // Is the "amount" an ORDER total (repeated on each line, or only on an order's first line)? Then adding it per line double-counts.
  let amountIsOrderLevel = false;
  if (roles.amount && roles.order && !profile) {
    const byOrder = new Map<string, Rec[]>();
    for (const r of recs) if (r.v.order) (byOrder.get(r.v.order) ?? byOrder.set(r.v.order, []).get(r.v.order)!).push(r);
    const multi = [...byOrder.values()].filter((g) => g.length >= 2 && new Set(g.map((r) => r.v.product ?? r.v.sku)).size >= 2);
    if (multi.length >= 2) {
      const repeated = multi.filter((g) => g.every((r) => r.v.amount !== undefined && r.v.amount === g[0].v.amount)).length;
      const firstOnly = multi.filter((g) => g[0].v.amount !== undefined && g.slice(1).every((r) => r.v.amount === undefined)).length;
      amountIsOrderLevel = (repeated + firstOnly) / multi.length >= 0.8;
    }
    if (amountIsOrderLevel) {
      const amtCol = roles.amount;
      if (roles.price) {
        delete roles.amount;
        issues.push({ kind: 'order-total', severity: 'info', count: multi.length, lines: [], message: `"${amtCol}" is each order's total (it repeats across an order's lines), so line values come from "${roles.price}" × quantity instead, to avoid counting orders twice.` });
      } else {
        // No unit price: split each order's total evenly over its lines.
        for (const g of byOrder.values()) {
          const total = g.map((r) => r.v.amount).find((a) => a !== undefined);
          if (total === undefined) continue;
          const n = parseNumber(total, detectDecimalComma([total], euroHint));
          if (n === null) continue;
          for (const r of g) r.v.amount = String(r2(n / g.length));
        }
        issues.push({ kind: 'order-total', severity: 'info', count: multi.length, lines: [], message: `"${amtCol}" is each order's total (it repeats across an order's lines) and there's no unit price, so each order's total is split evenly across its products. Order totals are exact; per-product values are estimates.` });
      }
    }
  }
  const dateVals = col('date');
  const auto = detectDateOrder(dateVals);
  const european = table.delimiter === ';' || Object.values(dc).some(Boolean);
  let dateOrder: DateOrder | null = opts.dateOrder ?? auto?.order ?? null, dateOrderAssumed = !opts.dateOrder && !!auto?.assumed;
  if (!opts.dateOrder && auto?.assumed && european) dateOrder = 'dmy';
  const allowSerial = dateVals.length > 0 && dateVals.every((v) => /^\d+(\.\d+)?$/.test(v.trim()));

  // ---- currency: a currency column wins, then symbols in the money columns
  let currency: string | null = null, currencySource = 'Not stated in the file';
  const curCol = col('currency').map((x) => x.trim().toUpperCase()).filter((x) => CURRENCY_CODES.has(x));
  if (curCol.length) {
    const counts = new Map<string, number>(); for (const c of curCol) counts.set(c, (counts.get(c) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    currency = sorted[0][0]; currencySource = `"${roles.currency}" column`;
    if (sorted.length > 1) issues.push({ kind: 'mixed-currency', severity: 'kept', count: curCol.length - sorted[0][1], lines: [], message: `The file mixes currencies (${sorted.map(([c, n]) => `${c}: ${n}`).join(', ')}). Amounts are added as written, in ${currency}.` });
  } else {
    const sym = currencyOf([...col('amount'), ...col('price')]);
    if (sym) { currency = sym; currencySource = 'Currency symbols in the amounts'; }
    else {
      const head = currencyOf([roles.amount, roles.price, roles.cost].filter(Boolean) as string[]);
      if (head) { currency = head; currencySource = 'Currency in the column header'; }
    }
  }

  if (opts.currency && CURRENCY_CODES.has(opts.currency.toUpperCase())) { currency = opts.currency.toUpperCase(); currencySource = 'You chose it'; }
  // ---- lines
  type Line = { order: string; date: string | null; product: string; sku: string; customer: string | null; country: string | null; region: string | null; qty: number; unit: number; sales: number; ret: boolean; cost: number | null; profit: number | null; category: string | null; extra: Record<string, string>; line: number };
  const lines: Line[] = [];
  const miss = (kind: string, role: Role | undefined, line: number, severity: Issue['severity'], message: (n: number) => string) => {
    let it = issues.find((x) => x.kind === kind);
    if (!it) { it = { kind, role, severity, count: 0, lines: [], message: '' }; issues.push(it); (it as any)._m = message; }
    it.count++; if (it.lines.length < 6) it.lines.push(line);
  };
  const hasPrice = !!roles.price, hasAmount = !!roles.amount, hasQty = !!roles.quantity;
  if (!hasPrice && !hasAmount) throw new IngestError('NO_MONEY', 'Couldn\'t find a money column (like Total, Amount, Sales or Price). Pick it below, or check that the file has one.', partialReport(primary, issues, fileInfo));
  let cancelledOrders = new Set<string>(), droppedStatus = 0;
  const orderGross = new Map<string, number>(), orderLines = new Map<string, number[]>();
  const orderDisc = new Map<string, number>(), orderRefund = new Map<string, number>();
  const multiProduct = hasAmount && !hasPrice && col('product').filter((p) => explodeMulti(p)).length >= Math.max(1, col('product').length * 0.3);

  recs.forEach((rec, i) => {
    const v = rec.v;
    const status = (v.status ?? '').trim();
    const order = v.order?.trim() || (v.customer && v.date ? `${v.date.slice(0, 10)}|${v.customer}` : `row-${rec.file}-${i}`);
    if (v.cancelled || (status && STATUS_DROP.test(status) && !/partial/i.test(status))) { cancelledOrders.add(order); droppedStatus++; return; }
    const date = roles.date ? parseDate(v.date, dateOrder ?? 'mdy', allowSerial) : null;
    if (roles.date && !date) { miss(v.date ? 'bad-date' : 'no-date', 'date', rec.line, 'dropped', (n) => v.date ? `${n} row(s) have a date Blindspot couldn't read, so they're left out.` : `${n} row(s) have no date, so they're left out (trends need a date).`); return; }
    let qty = hasQty ? parseNumber(v.quantity, dc.quantity) : 1;
    if (hasQty && qty === null) { if (v.quantity) miss('bad-qty', 'quantity', rec.line, 'kept', (n) => `${n} row(s) have a quantity that isn't a number; counted as 1.`); else miss('no-qty', 'quantity', rec.line, 'kept', (n) => `${n} row(s) have no quantity; counted as 1.`); qty = 1; }
    const price = hasPrice ? parseNumber(v.price, dc.price) : null;
    const amount = hasAmount ? parseNumber(v.amount, dc.amount) : null;
    let sales: number | null = null, unit: number | null = null;
    if (amount !== null) { sales = amount; unit = qty ? amount / qty : amount; }
    else if (price !== null) { unit = price; sales = price * (qty ?? 1); }
    if (sales === null) {
      const raw = v.amount ?? v.price;
      miss(raw ? 'bad-money' : 'no-money', hasAmount ? 'amount' : 'price', rec.line, 'dropped', (n) => raw ? `${n} row(s) have an amount Blindspot couldn't read as a number, so they're left out.` : `${n} row(s) have no price or amount, so they're left out (they can't be counted).`);
      return;
    }
    let ret = qty! < 0 || sales < 0 || /^C\d/.test(order) || (!!status && STATUS_RETURN.test(status));
    if (ret) { if (sales > 0) sales = -sales; if (qty! > 0) qty = -qty!; }
    // "Refunded" order with no refund-amount column: it was a sale, then fully refunded → sale + matching return.
    if (!ret && status && STATUS_REFUNDED.test(status) && !roles.refund && !orderRefund.has(order)) orderRefund.set(order, Infinity);
    // line-level discount (generic files): subtract when the sale was computed from price × quantity
    if (roles.discount && !profile?.orderLevel?.includes('discount')) {
      const d = parseNumber(v.discount, dc.discount);
      if (d && amount === null && d > 0 && d < Math.abs(sales)) sales -= Math.sign(sales) * d;
    }
    if (!v.product && v.sku) miss('sku-as-product', 'product', rec.line, 'kept', (n) => `${n} row(s) have no product name; shown by their SKU instead.`);
    else if (!v.product) miss('no-product', 'product', rec.line, 'kept', (n) => `${n} row(s) have no product name; shown as "Unknown product".`);
    if (roles.customer && !v.customer) miss('no-customer', 'customer', rec.line, 'kept', (n) => `${n} row(s) have no customer; shown as "Unknown customer" and left out of repeat-buyer checks.`);
    const costU = roles.cost ? parseNumber(v.cost, dc.cost) : null;
    const prof = roles.profit ? parseNumber(v.profit, dc.profit) : null;
    const base = { date, sku: v.sku?.trim() ?? '', customer: v.customer?.trim() || null, country: v.country?.trim() || null, region: v.region?.trim() || null, ret, category: v.category?.trim() || null, extra: rec.extra, line: rec.line, order };
    const items = multiProduct && v.product ? explodeMulti(v.product) : null;
    if (items) {
      const totalQ = items.reduce((s, x) => s + x.qty, 0) || 1;
      for (const it of items) { const share = it.qty / totalQ; const q = ret ? -it.qty : it.qty; lines.push({ ...base, product: it.name, qty: q, unit: Math.abs(sales * share / it.qty), sales: sales * share, cost: null, profit: null }); }
    } else {
      lines.push({ ...base, product: v.product?.trim() || (v.sku ? `SKU ${v.sku.trim()}` : 'Unknown product'), qty: qty!, unit: Math.abs(unit ?? 0), sales, cost: costU !== null ? costU * Math.abs(qty!) : null, profit: prof });
    }
    const li = lines.length - 1;
    if (!ret) { orderGross.set(order, (orderGross.get(order) ?? 0) + sales); (orderLines.get(order) ?? orderLines.set(order, []).get(order)!).push(li); }
    if (profile?.orderLevel?.includes('discount') && v.discount && !orderDisc.has(order)) orderDisc.set(order, parseNumber(v.discount, dc.discount) ?? 0);
    if (roles.refund && v.refund && !orderRefund.has(order)) orderRefund.set(order, parseNumber(v.refund, dc.refund) ?? 0);
  });
  // order-level discounts (Shopify): spread over the order's lines by value
  for (const [order, disc] of orderDisc) {
    const gross = orderGross.get(order) ?? 0, ls = orderLines.get(order) ?? [];
    if (disc > 0 && gross > 0 && disc < gross) for (const k of ls) { const share = lines[k].sales / gross; lines[k].sales -= share * disc; lines[k].unit = lines[k].sales / (lines[k].qty || 1); }
  }
  // refunds (Shopify "Refunded Amount", Stripe "Amount Refunded"): a return line per refunded order, split by line value
  let refundOrders = 0, refundValue = 0, refundLines = 0;
  for (const [order, refund] of orderRefund) {
    if (!(refund > 0)) continue;
    const ls = orderLines.get(order) ?? [], gross = ls.reduce((s, k) => s + lines[k].sales, 0);
    if (!ls.length || gross <= 0) continue;
    refundOrders++; refundValue += Math.min(refund, gross);
    for (const k of ls) {
      const L = lines[k], val = (L.sales / gross) * Math.min(refund, gross);
      lines.push({ ...L, ret: true, sales: -val, qty: -(L.qty * (val / L.sales)), unit: L.unit }); refundLines++;
    }
  }
  if (refundOrders) issues.push({ kind: 'refunds', severity: 'info', count: refundOrders, lines: [], message: `${refundOrders} order(s) were refunded (${r2(refundValue).toLocaleString()} in total); counted as returns, not sales.` });
  if (droppedStatus) issues.push({ kind: 'cancelled', severity: 'info', count: cancelledOrders.size, lines: [], message: `${cancelledOrders.size} cancelled, voided or failed order(s) (${droppedStatus} line(s)) were left out: no money changed hands.` });
  for (const it of issues) if ((it as any)._m) { it.message = (it as any)._m(it.count); delete (it as any)._m; }
  if (!lines.length) throw new IngestError('NO_ROWS', 'None of the rows could be used. Check the columns below: the date or amount column may be the wrong one.', partialReport(primary, issues, fileInfo));

  // ---- cleaning (duplicates, fees, reversed orders) through the same proven cleaner as the case study
  const hasCustomer = !!roles.customer;
  let rows: Row[], prep: PrepReport | null = null;
  // Decide which descriptive columns are worth keeping BEFORE building rows (deleting fields from 150k objects later is slow and memory-hungry).
  const varied = (f: (l: Line) => string | null | undefined, min = 2) => { const seen = new Set<string>(); for (const l of lines) { const v = f(l); if (v && v !== 'Unknown') { seen.add(v); if (seen.size >= min) return true; } } return false; };
  const useRegion = !!roles.region && varied((l) => l.region), useCategory = !!roles.category && varied((l) => l.category);
  const useCountry = !!roles.country && varied((l) => l.country, 1);
  const keepExtra = extras.filter((h) => varied((l) => l.extra[h]));
  const samples: Partial<Record<Role, string[]>> = {};
  for (const role of Object.keys(roles) as Role[]) samples[role] = [...new Set(col(role).slice(0, 2000))].slice(0, 3);
  const rowsRead = recs.length;
  recs = [];
  if (roles.date) {
    const keep = [...(useRegion ? ['Region'] : []), ...(useCategory ? ['Category'] : []), ...keepExtra];
    const canon: Row[] = new Array(lines.length);
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k];
      const o: Row = {
        Invoice: l.order, StockCode: profile?.id === 'uci' ? l.sku : '', Description: l.product, Quantity: l.qty, InvoiceDate: l.date, Price: l.unit,
        'Customer ID': l.customer ?? '', Country: useCountry ? (l.country ?? '') : 'All', __sales: r2(l.sales), __ret: l.ret ? 1 : 0, __cost: l.cost, __profit: l.profit,
      };
      if (useRegion) o.Region = l.region ?? '';
      if (useCategory) o.Category = l.category ?? '';
      for (const h of keepExtra) o[h] = l.extra[h] ?? '';
      canon[k] = o;
    }
    lines.length = 0;
    const ds = prepareTransactions(canon, primary.name, { currency: currency ?? 'XXX', exactSales: true, feeRule: profile?.id === 'uci' ? 'uci' : 'strict', pairReversals: profile?.id === 'uci', dedupe: profile?.id === 'uci', keep });
    canon.length = 0;
    rows = ds!.rows; prep = ds!.prep ?? null;
    if (prep && !hasCustomer) { prep.missingCustomerRows = 0; prep.missingCustomerSales = 0; }
    if (prep?.duplicateRows && profile?.id === 'uci') issues.push({ kind: 'duplicates', severity: 'info', count: prep.duplicateRows, lines: [], message: `${prep.duplicateRows.toLocaleString()} line(s) were exact copies of another line and were counted once.` });
    if (prep?.zeroPriceRows) issues.push({ kind: 'zero-value', severity: 'info', count: prep.zeroPriceRows, lines: [], message: `${prep.zeroPriceRows.toLocaleString()} line(s) had a value of 0 (free items or placeholders) and were left out.` });
    if (prep?.feeLines) issues.push({ kind: 'fees', severity: 'info', count: prep.feeLines, lines: [], message: `${prep.feeLines.toLocaleString()} line(s) were shipping, fees or adjustments, not products (${prep.feeCodes.slice(0, 4).join(', ')}); set aside from product sales.` });
    if (prep?.cancelledPairs) issues.push({ kind: 'reversed', severity: 'info', count: prep.cancelledPairs, lines: [], message: `${prep.cancelledPairs.toLocaleString()} order line(s) were cancelled within 2 days of being placed; removed from both sales and returns.` });
  } else {
    rows = lines.map((l) => {
      const o: Row = { Order: l.order, Product: l.product, Quantity: l.qty, Sales: r2(l.sales), IsReturn: l.ret ? 1 : 0 };
      if (hasCustomer) o.Customer = l.customer ?? 'Unknown customer';
      if (useCountry) o.Country = l.country ?? 'Unknown';
      if (useRegion) o.Region = l.region ?? 'Unknown';
      if (useCategory) o.Category = l.category ?? 'Unknown';
      for (const h of keepExtra) o[h] = l.extra[h] || 'Unknown';
      if (l.profit !== null) o.Profit = l.profit; else if (l.cost !== null) o.Profit = r2(l.sales - (l.ret ? -l.cost : l.cost));
      return o;
    });
  }

  // ---- what the file unlocks
  const dates = rows.map((r) => r.OrderDate).filter((x): x is string => typeof x === 'string').sort();
  const span = dates.length ? (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000 : 0;
  const nReturns = rows.filter((r) => r.IsReturn === 1).length;
  const orders = new Set(rows.map((r) => String(r.Order ?? ''))).size;
  const unlocks: Unlock[] = [
    { key: 'sales', label: 'Sales totals', ok: true, note: hasAmount ? `From "${roles.amount}"` : `From "${roles.price}" × ${hasQty ? `"${roles.quantity}"` : '1'}` },
    { key: 'trends', label: 'Trends & year-over-year', ok: !roles.date ? false : span >= 455 ? true : 'partial', note: !roles.date ? 'Needs a date column' : span >= 455 ? `${Math.round(span / 30)} months of history` : `Only ${Math.max(1, Math.round(span / 30))} month(s) of history; year-over-year needs 15+` },
    { key: 'products', label: 'Product checks', ok: !!roles.product, note: roles.product ? `From "${roles.product}"` : 'Needs a product column' },
    { key: 'customers', label: 'Customers & repeat buyers', ok: hasCustomer, note: hasCustomer ? `From "${roles.customer}"` : 'Needs a customer, email or customer ID column' },
    { key: 'orders', label: 'Order size', ok: roles.order ? true : hasCustomer && roles.date ? 'partial' : false, note: roles.order ? `From "${roles.order}"` : hasCustomer && roles.date ? 'No order numbers: same-day purchases by one customer count as one order' : 'Needs an order number' },
    { key: 'returns', label: 'Returns & refunds', ok: nReturns > 0 ? true : 'partial', note: nReturns > 0 ? `${nReturns.toLocaleString()} return line(s) found` : 'No returns found in the file (none marked, no negative amounts)' },
    { key: 'countries', label: 'Countries & regions', ok: !!(roles.country || roles.region), note: roles.country ? `From "${roles.country}"` : roles.region ? `From "${roles.region}"` : 'Needs a country or state column' },
    { key: 'profit', label: 'Profit & margins', ok: !!(roles.cost || roles.profit), note: roles.cost ? `From "${roles.cost}"` : roles.profit ? `From "${roles.profit}"` : 'Needs product costs: add a file with a cost per product or SKU' },
  ];
  const format = files.length > 1 ? `${fileInfo[0].format} + ${files.length - 1} more file(s)` : fileInfo[0].format;
  const report: IngestReport = {
    files: fileInfo, format, platform: profile?.id ?? null, columns: table.headers, roles, confidence: primary.confidence, samples,
    dateOrder: roles.date ? dateOrder : null, dateOrderAssumed: !!roles.date && dateOrderAssumed,
    currency, currencySource, rowsRead, rowsUsed: Math.max(0, rows.length - refundLines), ordersFound: orders,
    bridge: (() => { const ret = rows.reduce((n, r) => n + (r.IsReturn === 1 ? 1 : 0), 0), used = Math.max(0, rows.length - refundLines); return { read: rowsRead, leftOut: Math.max(0, rowsRead - used), used, refundRecordsAdded: refundLines, saleRecords: rows.length - ret, returnRecords: ret, analysed: rows.length }; })(),
    issues: issues.sort((a, b) => ({ dropped: 0, kept: 1, info: 2 }[a.severity] - { dropped: 0, kept: 1, info: 2 }[b.severity])), unlocks,
    dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : null, prep,
  };
  const label = `${format}${table.how ? ` (${table.how})` : ''}`;
  // Unknown currency stays unknown ('XXX': amounts shown without a symbol) until the person says what it is.
  return { dataset: { name: primary.name, source: 'csv', label, rows, currency: currency ?? 'XXX', prep: prep ?? undefined }, report };
}

function partialReport(p: Parsed, issues: Issue[], files: IngestReport['files']): Partial<IngestReport> {
  return { files, format: files[0]?.format, columns: p.table.headers, roles: p.roles, confidence: p.confidence, issues, platform: p.profile?.id ?? null };
}
