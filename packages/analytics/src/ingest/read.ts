import type { Dataset, Row } from '../types';
import { prepareTransactions, type PrepReport } from '../retail';
import { MONEY, colStats, detectRoles, nameScore } from './columns';
import { PROFILES, type Profile } from './platforms';
import { explodeMulti, toRecords, type Rec } from './records';
import {
  IngestError,
  ROLE_LABEL,
  type DateOrder,
  type IngestReport,
  type Issue,
  type Role,
  type RoleMap,
  type Unlock,
} from './report';
import { readTable, type Table, unpivotMonths } from './table';
import {
  CURRENCY_CODES,
  STATUS_DROP,
  STATUS_REFUNDED,
  STATUS_RETURN,
  currencyOf,
  detectDateOrder,
  detectDecimalComma,
  norm,
  parseDate,
  parseNumber,
  r2,
} from './values';

/* ------------------------------------------------------------------ main */

export interface IngestInput {
  name: string;
  text: string;
}
export interface IngestOptions {
  overrides?: Partial<Record<Role, string | null>>;
  dateOrder?: DateOrder;
  maxRows?: number;
  /** The person's answer when the file doesn't state its currency. */ currency?: string;
}

export interface Parsed {
  name: string;
  table: Table;
  profile: Profile | null;
  roles: RoleMap;
  confidence: Partial<Record<Role, number>>;
}

export function parseFile(
  f: IngestInput,
  overrides: Partial<Record<Role, string | null>> = {},
  limit?: number,
): Parsed {
  let table = readTable(f.text, limit);
  if (!table.rows.length)
    throw new IngestError('TOO_FEW_ROWS', `${f.name}: found a header but no rows of data under it.`);
  const hn = new Set(table.headers.map(norm));
  const profile = PROFILES.find((p) => p.detect.every((d) => hn.has(d))) ?? null;
  if (!profile) {
    const u = unpivotMonths(table);
    if (u) table = u;
  }
  // Separate first/last name columns and nothing else identifies the customer: join them into one.
  if (!profile && !table.headers.some((h) => nameScore('customer', h) > 0)) {
    const first = table.headers.findIndex((h) =>
      /^(first|given|fore)\s*_?name$|^vorname$|^prenom$|^nombre$/i.test(h.trim()),
    );
    const last = table.headers.findIndex((h) =>
      /^(last|family|sur)\s*_?name$|^surname$|^nachname$|^nom$|^apellidos?$/i.test(h.trim()),
    );
    if (first >= 0 && last >= 0) {
      table.headers.push('Customer name');
      for (const r of table.rows) r.push(`${r[first]} ${r[last]}`.trim());
    }
  }
  const { roles, confidence } = detectRoles(table, profile, overrides);
  return { name: f.name, table, profile, roles, confidence };
}

export function ingest(
  files: IngestInput[],
  opts: IngestOptions = {},
): { dataset: Dataset; report: IngestReport } {
  if (!files.length) throw new IngestError('EMPTY', 'No file was received.');
  const maxRows = opts.maxRows ?? 1_200_000;
  const primary = parseFile(files[0], opts.overrides, opts.maxRows);
  const { table, profile, roles } = primary;
  const issues: Issue[] = [];
  const kindOf = (name: string) =>
    /\.pdf$/i.test(name)
      ? 'PDF report'
      : /\.(xlsx|xlsm|xls|ods|numbers)$/i.test(name)
        ? 'Excel workbook'
        : 'Spreadsheet';
  const fileInfo: IngestReport['files'] = [
    {
      name: primary.name,
      format: profile?.label ?? (table.how ? 'Summary table' : kindOf(primary.name)),
      rows: table.rows.length,
      delimiter: table.delimiter,
      headerLine: table.headerLine,
      how: table.how,
    },
  ];
  if (table.headerLine > 1)
    issues.push({
      kind: 'title-rows',
      severity: 'info',
      count: table.headerLine - 1,
      lines: [],
      message: `Skipped ${table.headerLine - 1} line(s) above the column headers (titles or notes). Headers are on line ${table.headerLine}.`,
    });
  if (table.secondTable)
    issues.push({
      kind: 'second-table',
      severity: 'info',
      count: 1,
      lines: [table.secondTable.line],
      message: `A second table starts at line ${table.secondTable.line} (${table.secondTable.label}); only the first table, your sales, was read.`,
    });
  if (table.notes.length)
    issues.push({
      kind: 'notes',
      severity: 'info',
      count: table.notes.length,
      lines: table.notes.slice(0, 5),
      message: `Skipped ${table.notes.length} line(s) that were notes or page labels, not sales.`,
    });
  if (table.droppedTotals.length)
    issues.push({
      kind: 'totals',
      severity: 'info',
      count: table.droppedTotals.length,
      lines: table.droppedTotals.slice(0, 5),
      message: `Left out ${table.droppedTotals.length} total/summary line(s) so nothing is counted twice.`,
    });

  const usedCols = new Set(Object.values(roles));
  const extras = table.headers
    .filter((h) => !usedCols.has(h))
    .filter((h) => {
      const s = colStats(table.rows.map((r) => r[table.headers.indexOf(h)]));
      return (
        s.numeric < 0.3 &&
        s.date < 0.3 &&
        s.distinct >= 2 &&
        s.distinct <= 40 &&
        s.avgLen <= 40 &&
        !/email|phone|address|zip|postal|note|tag|id$/i.test(h)
      );
    })
    .slice(0, 5);
  // Exact copies: judged on the WHOLE original row. With order numbers, an identical row is a copy (removed);
  // without them, two identical rows may be two real purchases, so they're kept and flagged.
  let dupRows = 0;
  {
    const seen = new Set<string>(),
      keepRows: string[][] = [],
      keepLines: number[] = [],
      dupLines: number[] = [];
    table.rows.forEach((r, i) => {
      const k = r.join('\u0001');
      if (seen.has(k)) {
        dupRows++;
        if (dupLines.length < 6) dupLines.push(table.lines[i]);
        if (!roles.order || profile?.id === 'uci') {
          keepRows.push(r);
          keepLines.push(table.lines[i]);
        }
      } else {
        seen.add(k);
        keepRows.push(r);
        keepLines.push(table.lines[i]);
      }
    });
    if (dupRows && roles.order && profile?.id !== 'uci') {
      table.rows = keepRows;
      table.lines = keepLines;
      issues.push({
        kind: 'duplicates',
        severity: 'info',
        count: dupRows,
        lines: dupLines,
        message: `${dupRows.toLocaleString()} line(s) were exact copies of another line (every column identical) and were counted once.`,
      });
    } else if (dupRows && !roles.order)
      issues.push({
        kind: 'possible-duplicates',
        severity: 'kept',
        count: dupRows,
        lines: dupLines,
        message: `${dupRows.toLocaleString()} line(s) are identical to another line. Without order numbers Blindspot can't tell a copy from a repeat purchase, so they're all counted. If they're copies, remove them and upload again.`,
      });
  }
  let recs = toRecords(table, roles, 0, profile?.orderLevel ?? [], extras);

  // ---- extra files: append same-shaped exports, or fill missing details by a shared key
  for (let fi = 1; fi < files.length; fi++) {
    const p = parseFile(files[fi], {}, opts.maxRows);
    const same =
      p.table.headers.length &&
      p.table.headers.filter((h) => table.headers.map(norm).includes(norm(h))).length /
        Math.max(p.table.headers.length, table.headers.length) >=
        0.8;
    if (same) {
      const remapped = Object.fromEntries(
        Object.entries(roles).map(([r, c]) => [r, p.table.headers.find((h) => norm(h) === norm(c!))]),
      ) as RoleMap;
      const add = toRecords(
        p.table,
        remapped,
        fi,
        profile?.orderLevel ?? [],
        extras.filter((h) => p.table.headers.includes(h)),
      );
      recs = recs.concat(add);
      fileInfo.push({
        name: p.name,
        format: 'Added rows (same columns)',
        rows: p.table.rows.length,
        delimiter: p.table.delimiter,
        headerLine: p.table.headerLine,
        how: `${add.length.toLocaleString()} rows added to the first file`,
      });
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
      fileInfo.push({
        name: p.name,
        format: 'Not merged',
        rows: p.table.rows.length,
        delimiter: p.table.delimiter,
        headerLine: p.table.headerLine,
        how: 'No order number, SKU, product or customer in common with the first file',
      });
      issues.push({
        kind: 'merge-failed',
        severity: 'info',
        count: 1,
        lines: [],
        message: `${p.name} couldn't be matched to your sales: it shares no order numbers, SKUs, products or customers with the first file.`,
      });
      continue;
    }
    const lookup = new Map<string, Rec>();
    for (const r of extraRecs) {
      const k = r.v[best.key]?.trim().toLowerCase();
      if (k && !lookup.has(k)) lookup.set(k, r);
    }
    const fillable = (Object.keys(p.roles) as Role[]).filter(
      (r) => r !== best!.key && !['order'].includes(r),
    );
    let filled = 0;
    for (const rec of recs) {
      const m = lookup.get(rec.v[best.key]?.trim().toLowerCase() ?? '');
      if (!m) continue;
      let any = false;
      for (const role of fillable)
        if (rec.v[role] === undefined && m.v[role] !== undefined) {
          rec.v[role] = m.v[role];
          any = true;
        }
      if (any) filled++;
    }
    for (const role of fillable) if (!roles[role]) roles[role] = `${p.roles[role]} (from ${p.name})`;
    fileInfo.push({
      name: p.name,
      format: 'Merged details',
      rows: p.table.rows.length,
      delimiter: p.table.delimiter,
      headerLine: p.table.headerLine,
      how: `Matched by ${ROLE_LABEL[best.key].toLowerCase()} (${Math.round(best.hit * 100)}% matched); filled ${fillable.map((r) => ROLE_LABEL[r].toLowerCase()).join(', ')} on ${filled.toLocaleString()} rows`,
    });
  }
  const fullSize = Math.max(recs.length, (table.totalLines ?? 0) - table.headerLine);
  if (fullSize > maxRows) {
    issues.push({
      kind: 'trimmed',
      severity: 'dropped',
      count: fullSize - maxRows,
      lines: [],
      message: `The file has about ${fullSize.toLocaleString()} rows; the first ${maxRows.toLocaleString()} were analyzed. Export a shorter date range (or split it into files) for the rest.`,
    });
    if (recs.length > maxRows) recs.length = maxRows;
  }
  table.rows = []; // records hold everything needed from here on

  // ---- how to read numbers and dates (decided per column from all values)
  const col = (role: Role) => recs.map((r) => r.v[role]).filter((x): x is string => x !== undefined);
  const euroHint =
    table.delimiter === ';' || /€/.test(col('amount').concat(col('price')).slice(0, 200).join(' '));
  const dc: Partial<Record<Role, boolean>> = {};
  for (const role of [...MONEY, 'quantity'] as Role[]) dc[role] = detectDecimalComma(col(role), euroHint);

  // Is the "amount" an ORDER total (repeated on each line, or only on an order's first line)? Then adding it per line double-counts.
  let amountIsOrderLevel = false;
  if (roles.amount && roles.order && !profile) {
    const byOrder = new Map<string, Rec[]>();
    for (const r of recs)
      if (r.v.order) (byOrder.get(r.v.order) ?? byOrder.set(r.v.order, []).get(r.v.order)!).push(r);
    const multi = [...byOrder.values()].filter(
      (g) => g.length >= 2 && new Set(g.map((r) => r.v.product ?? r.v.sku)).size >= 2,
    );
    if (multi.length >= 2) {
      const repeated = multi.filter((g) =>
        g.every((r) => r.v.amount !== undefined && r.v.amount === g[0].v.amount),
      ).length;
      const firstOnly = multi.filter(
        (g) => g[0].v.amount !== undefined && g.slice(1).every((r) => r.v.amount === undefined),
      ).length;
      amountIsOrderLevel = (repeated + firstOnly) / multi.length >= 0.8;
    }
    if (amountIsOrderLevel) {
      const amtCol = roles.amount;
      if (roles.price) {
        delete roles.amount;
        issues.push({
          kind: 'order-total',
          severity: 'info',
          count: multi.length,
          lines: [],
          message: `"${amtCol}" is each order's total (it repeats across an order's lines), so line values come from "${roles.price}" × quantity instead, to avoid counting orders twice.`,
        });
      } else {
        // No unit price: split each order's total evenly over its lines.
        for (const g of byOrder.values()) {
          const total = g.map((r) => r.v.amount).find((a) => a !== undefined);
          if (total === undefined) continue;
          const n = parseNumber(total, detectDecimalComma([total], euroHint));
          if (n === null) continue;
          for (const r of g) r.v.amount = String(r2(n / g.length));
        }
        issues.push({
          kind: 'order-total',
          severity: 'info',
          count: multi.length,
          lines: [],
          message: `"${amtCol}" is each order's total (it repeats across an order's lines) and there's no unit price, so each order's total is split evenly across its products. Order totals are exact; per-product values are estimates.`,
        });
      }
    }
  }
  const dateVals = col('date');
  const auto = detectDateOrder(dateVals);
  const european = table.delimiter === ';' || Object.values(dc).some(Boolean);
  let dateOrder: DateOrder | null = opts.dateOrder ?? auto?.order ?? null;
  const dateOrderAssumed = !opts.dateOrder && !!auto?.assumed;
  if (!opts.dateOrder && auto?.assumed && european) dateOrder = 'dmy';
  const allowSerial = dateVals.length > 0 && dateVals.every((v) => /^\d+(\.\d+)?$/.test(v.trim()));

  // ---- currency: a currency column wins, then symbols in the money columns
  const { currency, currencySource } = detectCurrency(col, roles, issues, opts.currency);
  // ---- lines
  type Line = {
    order: string;
    date: string | null;
    product: string;
    sku: string;
    customer: string | null;
    country: string | null;
    region: string | null;
    qty: number;
    unit: number;
    sales: number;
    ret: boolean;
    cost: number | null;
    profit: number | null;
    category: string | null;
    extra: Record<string, string>;
    line: number;
  };
  const lines: Line[] = [];
  const miss = (
    kind: string,
    role: Role | undefined,
    line: number,
    severity: Issue['severity'],
    message: (n: number) => string,
  ) => {
    let it = issues.find((x) => x.kind === kind);
    if (!it) {
      it = { kind, role, severity, count: 0, lines: [], message: '' };
      issues.push(it);
      (it as any)._m = message;
    }
    it.count++;
    if (it.lines.length < 6) it.lines.push(line);
  };
  const hasPrice = !!roles.price,
    hasAmount = !!roles.amount,
    hasQty = !!roles.quantity;
  if (!hasPrice && !hasAmount)
    throw new IngestError(
      'NO_MONEY',
      "Couldn't find a money column (like Total, Amount, Sales or Price). Pick it below, or check that the file has one.",
      partialReport(primary, issues, fileInfo),
    );
  const cancelledOrders = new Set<string>();
  let droppedStatus = 0;
  const orderGross = new Map<string, number>(),
    orderLines = new Map<string, number[]>();
  const orderDisc = new Map<string, number>(),
    orderRefund = new Map<string, number>();
  const multiProduct =
    hasAmount &&
    !hasPrice &&
    col('product').filter((p) => explodeMulti(p)).length >= Math.max(1, col('product').length * 0.3);

  recs.forEach((rec, i) => {
    const v = rec.v;
    const status = (v.status ?? '').trim();
    const order =
      v.order?.trim() ||
      (v.customer && v.date ? `${v.date.slice(0, 10)}|${v.customer}` : `row-${rec.file}-${i}`);
    if (v.cancelled || (status && STATUS_DROP.test(status) && !/partial/i.test(status))) {
      cancelledOrders.add(order);
      droppedStatus++;
      return;
    }
    const date = roles.date ? parseDate(v.date, dateOrder ?? 'mdy', allowSerial) : null;
    if (roles.date && !date) {
      miss(v.date ? 'bad-date' : 'no-date', 'date', rec.line, 'dropped', (n) =>
        v.date
          ? `${n} row(s) have a date Blindspot couldn't read, so they're left out.`
          : `${n} row(s) have no date, so they're left out (trends need a date).`,
      );
      return;
    }
    let qty = hasQty ? parseNumber(v.quantity, dc.quantity) : 1;
    if (hasQty && qty === null) {
      if (v.quantity)
        miss(
          'bad-qty',
          'quantity',
          rec.line,
          'kept',
          (n) => `${n} row(s) have a quantity that isn't a number; counted as 1.`,
        );
      else miss('no-qty', 'quantity', rec.line, 'kept', (n) => `${n} row(s) have no quantity; counted as 1.`);
      qty = 1;
    }
    const price = hasPrice ? parseNumber(v.price, dc.price) : null;
    const amount = hasAmount ? parseNumber(v.amount, dc.amount) : null;
    let sales: number | null = null,
      unit: number | null = null;
    if (amount !== null) {
      sales = amount;
      unit = qty ? amount / qty : amount;
    } else if (price !== null) {
      unit = price;
      sales = price * (qty ?? 1);
    }
    if (sales === null) {
      const raw = v.amount ?? v.price;
      miss(raw ? 'bad-money' : 'no-money', hasAmount ? 'amount' : 'price', rec.line, 'dropped', (n) =>
        raw
          ? `${n} row(s) have an amount Blindspot couldn't read as a number, so they're left out.`
          : `${n} row(s) have no price or amount, so they're left out (they can't be counted).`,
      );
      return;
    }
    const ret = qty! < 0 || sales < 0 || /^C\d/.test(order) || (!!status && STATUS_RETURN.test(status));
    if (ret) {
      if (sales > 0) sales = -sales;
      if (qty! > 0) qty = -qty!;
    }
    // "Refunded" order with no refund-amount column: it was a sale, then fully refunded → sale + matching return.
    if (!ret && status && STATUS_REFUNDED.test(status) && !roles.refund && !orderRefund.has(order))
      orderRefund.set(order, Infinity);
    // line-level discount (generic files): subtract when the sale was computed from price × quantity
    if (roles.discount && !profile?.orderLevel?.includes('discount')) {
      const d = parseNumber(v.discount, dc.discount);
      if (d && amount === null && d > 0 && d < Math.abs(sales)) sales -= Math.sign(sales) * d;
    }
    if (!v.product && v.sku)
      miss(
        'sku-as-product',
        'product',
        rec.line,
        'kept',
        (n) => `${n} row(s) have no product name; shown by their SKU instead.`,
      );
    else if (!v.product)
      miss(
        'no-product',
        'product',
        rec.line,
        'kept',
        (n) => `${n} row(s) have no product name; shown as "Unknown product".`,
      );
    if (roles.customer && !v.customer)
      miss(
        'no-customer',
        'customer',
        rec.line,
        'kept',
        (n) =>
          `${n} row(s) have no customer; shown as "Unknown customer" and left out of repeat-buyer checks.`,
      );
    const costU = roles.cost ? parseNumber(v.cost, dc.cost) : null;
    const prof = roles.profit ? parseNumber(v.profit, dc.profit) : null;
    const base = {
      date,
      sku: v.sku?.trim() ?? '',
      customer: v.customer?.trim() || null,
      country: v.country?.trim() || null,
      region: v.region?.trim() || null,
      ret,
      category: v.category?.trim() || null,
      extra: rec.extra,
      line: rec.line,
      order,
    };
    const items = multiProduct && v.product ? explodeMulti(v.product) : null;
    if (items) {
      const totalQ = items.reduce((s, x) => s + x.qty, 0) || 1;
      for (const it of items) {
        const share = it.qty / totalQ;
        const q = ret ? -it.qty : it.qty;
        lines.push({
          ...base,
          product: it.name,
          qty: q,
          unit: Math.abs((sales * share) / it.qty),
          sales: sales * share,
          cost: null,
          profit: null,
        });
      }
    } else {
      lines.push({
        ...base,
        product: v.product?.trim() || (v.sku ? `SKU ${v.sku.trim()}` : 'Unknown product'),
        qty: qty!,
        unit: Math.abs(unit ?? 0),
        sales,
        cost: costU !== null ? costU * Math.abs(qty!) : null,
        profit: prof,
      });
    }
    const li = lines.length - 1;
    if (!ret) {
      orderGross.set(order, (orderGross.get(order) ?? 0) + sales);
      (orderLines.get(order) ?? orderLines.set(order, []).get(order)!).push(li);
    }
    if (profile?.orderLevel?.includes('discount') && v.discount && !orderDisc.has(order))
      orderDisc.set(order, parseNumber(v.discount, dc.discount) ?? 0);
    if (roles.refund && v.refund && !orderRefund.has(order))
      orderRefund.set(order, parseNumber(v.refund, dc.refund) ?? 0);
  });
  // order-level discounts (Shopify): spread over the order's lines by value
  for (const [order, disc] of orderDisc) {
    const gross = orderGross.get(order) ?? 0,
      ls = orderLines.get(order) ?? [];
    if (disc > 0 && gross > 0 && disc < gross)
      for (const k of ls) {
        const share = lines[k].sales / gross;
        lines[k].sales -= share * disc;
        lines[k].unit = lines[k].sales / (lines[k].qty || 1);
      }
  }
  // refunds (Shopify "Refunded Amount", Stripe "Amount Refunded"): a return line per refunded order, split by line value
  let refundOrders = 0,
    refundValue = 0,
    refundLines = 0;
  for (const [order, refund] of orderRefund) {
    if (!(refund > 0)) continue;
    const ls = orderLines.get(order) ?? [],
      gross = ls.reduce((s, k) => s + lines[k].sales, 0);
    if (!ls.length || gross <= 0) continue;
    refundOrders++;
    refundValue += Math.min(refund, gross);
    for (const k of ls) {
      const L = lines[k],
        val = (L.sales / gross) * Math.min(refund, gross);
      lines.push({ ...L, ret: true, sales: -val, qty: -(L.qty * (val / L.sales)), unit: L.unit });
      refundLines++;
    }
  }
  if (refundOrders)
    issues.push({
      kind: 'refunds',
      severity: 'info',
      count: refundOrders,
      lines: [],
      message: `${refundOrders} order(s) were refunded (${r2(refundValue).toLocaleString()} in total); counted as returns, not sales.`,
    });
  if (droppedStatus)
    issues.push({
      kind: 'cancelled',
      severity: 'info',
      count: cancelledOrders.size,
      lines: [],
      message: `${cancelledOrders.size} cancelled, voided or failed order(s) (${droppedStatus} line(s)) were left out: no money changed hands.`,
    });
  for (const it of issues)
    if ((it as any)._m) {
      it.message = (it as any)._m(it.count);
      delete (it as any)._m;
    }
  if (!lines.length)
    throw new IngestError(
      'NO_ROWS',
      'None of the rows could be used. Check the columns below: the date or amount column may be the wrong one.',
      partialReport(primary, issues, fileInfo),
    );

  // ---- cleaning (duplicates, fees, reversed orders) through the same proven cleaner as the case study
  const hasCustomer = !!roles.customer;
  let rows: Row[],
    prep: PrepReport | null = null;
  // Decide which descriptive columns are worth keeping BEFORE building rows (deleting fields from 150k objects later is slow and memory-hungry).
  const varied = (f: (l: Line) => string | null | undefined, min = 2) => {
    const seen = new Set<string>();
    for (const l of lines) {
      const v = f(l);
      if (v && v !== 'Unknown') {
        seen.add(v);
        if (seen.size >= min) return true;
      }
    }
    return false;
  };
  const useRegion = !!roles.region && varied((l) => l.region),
    useCategory = !!roles.category && varied((l) => l.category);
  const useCountry = !!roles.country && varied((l) => l.country, 1);
  const keepExtra = extras.filter((h) => varied((l) => l.extra[h]));
  const samples: Partial<Record<Role, string[]>> = {};
  for (const role of Object.keys(roles) as Role[])
    samples[role] = [...new Set(col(role).slice(0, 2000))].slice(0, 3);
  const rowsRead = recs.length;
  recs = [];
  if (roles.date) {
    const keep = [...(useRegion ? ['Region'] : []), ...(useCategory ? ['Category'] : []), ...keepExtra];
    const canon: Row[] = new Array(lines.length);
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k];
      const o: Row = {
        Invoice: l.order,
        StockCode: profile?.id === 'uci' ? l.sku : '',
        Description: l.product,
        Quantity: l.qty,
        InvoiceDate: l.date,
        Price: l.unit,
        'Customer ID': l.customer ?? '',
        Country: useCountry ? (l.country ?? '') : 'All',
        __sales: r2(l.sales),
        __ret: l.ret ? 1 : 0,
        __cost: l.cost,
        __profit: l.profit,
      };
      if (useRegion) o.Region = l.region ?? '';
      if (useCategory) o.Category = l.category ?? '';
      for (const h of keepExtra) o[h] = l.extra[h] ?? '';
      canon[k] = o;
    }
    lines.length = 0;
    const ds = prepareTransactions(canon, primary.name, {
      currency: currency ?? 'XXX',
      exactSales: true,
      feeRule: profile?.id === 'uci' ? 'uci' : 'strict',
      pairReversals: profile?.id === 'uci',
      dedupe: profile?.id === 'uci',
      keep,
    });
    canon.length = 0;
    rows = ds!.rows;
    prep = ds!.prep ?? null;
    if (prep && !hasCustomer) {
      prep.missingCustomerRows = 0;
      prep.missingCustomerSales = 0;
    }
    if (prep?.duplicateRows && profile?.id === 'uci')
      issues.push({
        kind: 'duplicates',
        severity: 'info',
        count: prep.duplicateRows,
        lines: [],
        message: `${prep.duplicateRows.toLocaleString()} line(s) were exact copies of another line and were counted once.`,
      });
    if (prep?.zeroPriceRows)
      issues.push({
        kind: 'zero-value',
        severity: 'info',
        count: prep.zeroPriceRows,
        lines: [],
        message: `${prep.zeroPriceRows.toLocaleString()} line(s) had a value of 0 (free items or placeholders) and were left out.`,
      });
    if (prep?.feeLines)
      issues.push({
        kind: 'fees',
        severity: 'info',
        count: prep.feeLines,
        lines: [],
        message: `${prep.feeLines.toLocaleString()} line(s) were shipping, fees or adjustments, not products (${prep.feeCodes.slice(0, 4).join(', ')}); set aside from product sales.`,
      });
    if (prep?.cancelledPairs)
      issues.push({
        kind: 'reversed',
        severity: 'info',
        count: prep.cancelledPairs,
        lines: [],
        message: `${prep.cancelledPairs.toLocaleString()} order line(s) were cancelled within 2 days of being placed; removed from both sales and returns.`,
      });
  } else {
    rows = lines.map((l) => {
      const o: Row = {
        Order: l.order,
        Product: l.product,
        Quantity: l.qty,
        Sales: r2(l.sales),
        IsReturn: l.ret ? 1 : 0,
      };
      if (hasCustomer) o.Customer = l.customer ?? 'Unknown customer';
      if (useCountry) o.Country = l.country ?? 'Unknown';
      if (useRegion) o.Region = l.region ?? 'Unknown';
      if (useCategory) o.Category = l.category ?? 'Unknown';
      for (const h of keepExtra) o[h] = l.extra[h] || 'Unknown';
      if (l.profit !== null) o.Profit = l.profit;
      else if (l.cost !== null) o.Profit = r2(l.sales - (l.ret ? -l.cost : l.cost));
      return o;
    });
  }

  // ---- what the file unlocks
  const dates = rows
    .map((r) => r.OrderDate)
    .filter((x): x is string => typeof x === 'string')
    .sort();
  const span = dates.length ? (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000 : 0;
  const nReturns = rows.filter((r) => r.IsReturn === 1).length;
  const orders = new Set(rows.map((r) => String(r.Order ?? ''))).size;
  const unlocks = whatItUnlocks({ roles, hasAmount, hasQty, hasCustomer, span, nReturns });
  const format =
    files.length > 1 ? `${fileInfo[0].format} + ${files.length - 1} more file(s)` : fileInfo[0].format;
  const report: IngestReport = {
    files: fileInfo,
    format,
    platform: profile?.id ?? null,
    columns: table.headers,
    roles,
    confidence: primary.confidence,
    samples,
    dateOrder: roles.date ? dateOrder : null,
    dateOrderAssumed: !!roles.date && dateOrderAssumed,
    currency,
    currencySource,
    rowsRead,
    rowsUsed: Math.max(0, rows.length - refundLines),
    ordersFound: orders,
    bridge: (() => {
      const ret = rows.reduce((n, r) => n + (r.IsReturn === 1 ? 1 : 0), 0),
        used = Math.max(0, rows.length - refundLines);
      return {
        read: rowsRead,
        leftOut: Math.max(0, rowsRead - used),
        used,
        refundRecordsAdded: refundLines,
        saleRecords: rows.length - ret,
        returnRecords: ret,
        analysed: rows.length,
      };
    })(),
    issues: issues.sort(
      (a, b) => ({ dropped: 0, kept: 1, info: 2 })[a.severity] - { dropped: 0, kept: 1, info: 2 }[b.severity],
    ),
    unlocks,
    dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : null,
    prep,
  };
  const label = `${format}${table.how ? ` (${table.how})` : ''}`;
  // Unknown currency stays unknown ('XXX': amounts shown without a symbol) until the person says what it is.
  return {
    dataset: {
      name: primary.name,
      source: 'csv',
      label,
      rows,
      currency: currency ?? 'XXX',
      prep: prep ?? undefined,
    },
    report,
  };
}

/** What the file lets Blindspot check, and why anything is missing. */
function whatItUnlocks(f: {
  roles: RoleMap;
  hasAmount: boolean;
  hasQty: boolean;
  hasCustomer: boolean;
  span: number;
  nReturns: number;
}): Unlock[] {
  const { roles, hasAmount, hasQty, hasCustomer, span, nReturns } = f;
  return [
    {
      key: 'sales',
      label: 'Sales totals',
      ok: true,
      note: hasAmount
        ? `From "${roles.amount}"`
        : `From "${roles.price}" × ${hasQty ? `"${roles.quantity}"` : '1'}`,
    },
    {
      key: 'trends',
      label: 'Trends & year-over-year',
      ok: !roles.date ? false : span >= 455 ? true : 'partial',
      note: !roles.date
        ? 'Needs a date column'
        : span >= 455
          ? `${Math.round(span / 30)} months of history`
          : `Only ${Math.max(1, Math.round(span / 30))} month(s) of history; year-over-year needs 15+`,
    },
    {
      key: 'products',
      label: 'Product checks',
      ok: !!roles.product,
      note: roles.product ? `From "${roles.product}"` : 'Needs a product column',
    },
    {
      key: 'customers',
      label: 'Customers & repeat buyers',
      ok: hasCustomer,
      note: hasCustomer ? `From "${roles.customer}"` : 'Needs a customer, email or customer ID column',
    },
    {
      key: 'orders',
      label: 'Order size',
      ok: roles.order ? true : hasCustomer && roles.date ? 'partial' : false,
      note: roles.order
        ? `From "${roles.order}"`
        : hasCustomer && roles.date
          ? 'No order numbers: same-day purchases by one customer count as one order'
          : 'Needs an order number',
    },
    {
      key: 'returns',
      label: 'Returns & refunds',
      ok: nReturns > 0 ? true : 'partial',
      note:
        nReturns > 0
          ? `${nReturns.toLocaleString()} return line(s) found`
          : 'No returns found in the file (none marked, no negative amounts)',
    },
    {
      key: 'countries',
      label: 'Countries & regions',
      ok: !!(roles.country || roles.region),
      note: roles.country
        ? `From "${roles.country}"`
        : roles.region
          ? `From "${roles.region}"`
          : 'Needs a country or state column',
    },
    {
      key: 'profit',
      label: 'Profit & margins',
      ok: !!(roles.cost || roles.profit),
      note: roles.cost
        ? `From "${roles.cost}"`
        : roles.profit
          ? `From "${roles.profit}"`
          : 'Needs product costs: add a file with a cost per product or SKU',
    },
  ];
}

/** The file's currency: a currency column wins, then symbols in the amounts, then the column header. */
function detectCurrency(
  col: (role: Role) => string[],
  roles: RoleMap,
  issues: Issue[],
  chosen?: string,
): { currency: string | null; currencySource: string } {
  let currency: string | null = null,
    currencySource = 'Not stated in the file';
  const curCol = col('currency')
    .map((x) => x.trim().toUpperCase())
    .filter((x) => CURRENCY_CODES.has(x));
  if (curCol.length) {
    const counts = new Map<string, number>();
    for (const c of curCol) counts.set(c, (counts.get(c) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    currency = sorted[0][0];
    currencySource = `"${roles.currency}" column`;
    if (sorted.length > 1)
      issues.push({
        kind: 'mixed-currency',
        severity: 'kept',
        count: curCol.length - sorted[0][1],
        lines: [],
        message: `The file mixes currencies (${sorted.map(([c, n]) => `${c}: ${n}`).join(', ')}). Amounts are added as written, in ${currency}.`,
      });
  } else {
    const sym = currencyOf([...col('amount'), ...col('price')]);
    if (sym) {
      currency = sym;
      currencySource = 'Currency symbols in the amounts';
    } else {
      const head = currencyOf([roles.amount, roles.price, roles.cost].filter(Boolean) as string[]);
      if (head) {
        currency = head;
        currencySource = 'Currency in the column header';
      }
    }
  }

  if (chosen && CURRENCY_CODES.has(chosen.toUpperCase())) {
    currency = chosen.toUpperCase();
    currencySource = 'You chose it';
  }
  return { currency, currencySource };
}

export function partialReport(
  p: Parsed,
  issues: Issue[],
  files: IngestReport['files'],
): Partial<IngestReport> {
  return {
    files,
    format: files[0]?.format,
    columns: p.table.headers,
    roles: p.roles,
    confidence: p.confidence,
    issues,
    platform: p.profile?.id ?? null,
  };
}
