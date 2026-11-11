import type { Profile } from './platforms';
import { ROLES, type Role, type RoleMap } from './report';
import type { Table } from './table';
import {
  COUNTRIES,
  CURRENCY_CODES,
  STATUS_DROP,
  STATUS_REFUNDED,
  STATUS_RETURN,
  blank,
  detectDateOrder,
  detectDecimalComma,
  norm,
  parseDate,
  parseNumber,
} from './values';

/* ------------------------------------------------------------------ generic role detection */

export const NAMES: Record<Role, { exact: string[]; contains: string[]; not?: string[] }> = {
  date: {
    exact: [
      'date',
      'orderdate',
      'saledate',
      'createdat',
      'created',
      'paidat',
      'purchasedate',
      'invoicedate',
      'transactiondate',
      'datetime',
      'timestamp',
      'day',
      'month',
      'period',
      'fecha',
      'datum',
      'data',
      'dateofsale',
      'orderedat',
      'placedat',
    ],
    contains: ['date', 'created', 'time', 'fecha', 'datum'],
    not: ['ship', 'deliver', 'fulfil', 'update', 'cancel', 'refund', 'birth', 'due', 'expir'],
  },
  order: {
    exact: [
      'order',
      'orderid',
      'ordernumber',
      'orderno',
      'ordername',
      'invoice',
      'invoiceid',
      'invoiceno',
      'invoicenumber',
      'transactionid',
      'transaction',
      'receipt',
      'receiptnumber',
      'receiptid',
      'salesorder',
      'saleid',
      'pedido',
      'numeropedido',
      'bestellnummer',
      'bestellung',
      'rechnungsnummer',
      'auftragsnummer',
      'commande',
      'numerocommande',
      'facture',
      'factura',
      'ordine',
      'bestelling',
    ],
    contains: ['orderid', 'ordernum', 'orderno', 'invoice', 'transactionid', 'receipt'],
    not: ['date', 'status', 'total', 'line'],
  },
  product: {
    exact: [
      'product',
      'productname',
      'producttitle',
      'item',
      'itemname',
      'itemtitle',
      'description',
      'title',
      'name',
      'lineitemname',
      'products',
      'article',
      'articulo',
      'artikel',
      'artikelname',
      'bezeichnung',
      'produktname',
      'produkt',
      'produit',
      'producto',
      'prodotto',
      'produto',
      'designation',
      'libelle',
      'descripcion',
      'service',
      'variant',
      'goods',
      'merchandise',
    ],
    contains: ['product', 'itemname', 'item', 'description', 'title'],
    not: ['id', 'type', 'category', 'sku', 'code', 'quantity', 'qty', 'price', 'count', 'vendor', 'customer'],
  },
  sku: {
    exact: [
      'sku',
      'stockcode',
      'productid',
      'itemcode',
      'productcode',
      'variantsku',
      'asin',
      'upc',
      'barcode',
      'ean',
      'itemid',
      'partnumber',
    ],
    contains: ['sku', 'stockcode', 'productcode', 'itemcode', 'barcode'],
  },
  quantity: {
    exact: [
      'quantity',
      'qty',
      'units',
      'unitssold',
      'itemssold',
      'count',
      'pieces',
      'pcs',
      'cantidad',
      'menge',
      'anzahl',
      'stuck',
      'quantite',
      'qte',
      'quantita',
      'quantidade',
      'qtd',
      'volume',
      'numberofitems',
      'aantal',
    ],
    contains: ['quantity', 'qty', 'unitssold', 'itemssold'],
    not: ['price', 'refund', 'return'],
  },
  price: {
    exact: [
      'price',
      'unitprice',
      'itemprice',
      'saleprice',
      'priceeach',
      'rate',
      'precio',
      'preciounitario',
      'preis',
      'einzelpreis',
      'stuckpreis',
      'prix',
      'prixunitaire',
      'prezzo',
      'preco',
      'sellingprice',
      'prijs',
    ],
    contains: ['unitprice', 'priceeach', 'price'],
    not: ['total', 'cost', 'compare', 'original', 'list', 'msrp', 'tax'],
  },
  amount: {
    exact: [
      'netsales',
      'total',
      'amount',
      'sales',
      'revenue',
      'linetotal',
      'itemtotal',
      'ordertotal',
      'subtotal',
      'grosssales',
      'totalsales',
      'value',
      'salesamount',
      'totalamount',
      'netamount',
      'grandtotal',
      'totalprice',
      'importe',
      'betrag',
      'montant',
      'valor',
      'umsatz',
      'ventas',
      'income',
      'turnover',
      'paid',
      'amountpaid',
      'charged',
      'net',
    ],
    contains: ['netsales', 'total', 'amount', 'sales', 'revenue', 'importe', 'betrag', 'montant', 'umsatz'],
    not: [
      'tax',
      'vat',
      'shipping',
      'discount',
      'refund',
      'fee',
      'cost',
      'tip',
      'count',
      'quantity',
      'qty',
      'items',
      'id',
      'number',
      'orders',
      'customers',
    ],
  },
  customer: {
    exact: [
      'customer',
      'customerid',
      'customername',
      'customeremail',
      'email',
      'buyer',
      'buyername',
      'buyeremail',
      'client',
      'clientid',
      'clientname',
      'billingname',
      'purchaser',
      'user',
      'userid',
      'member',
      'cliente',
      'kunde',
      'kundenname',
      'kundennummer',
      'shopper',
      'account',
      'contact',
      'klant',
      'acheteur',
    ],
    contains: ['customer', 'buyer', 'client', 'email', 'kunde', 'cliente'],
    not: ['type', 'note', 'group', 'segment', 'since', 'count', 'phone'],
  },
  country: {
    exact: [
      'country',
      'shipcountry',
      'shippingcountry',
      'billingcountry',
      'countrycode',
      'nation',
      'pais',
      'land',
      'pays',
      'paese',
      'market',
    ],
    contains: ['country', 'pais'],
  },
  region: {
    exact: [
      'state',
      'province',
      'region',
      'shipstate',
      'shippingprovince',
      'shippingprovincename',
      'billingprovince',
      'county',
      'territory',
      'area',
      'city',
      'location',
      'store',
      'branch',
    ],
    contains: ['state', 'province', 'region'],
    not: ['status', 'statement'],
  },
  status: {
    exact: [
      'status',
      'orderstatus',
      'financialstatus',
      'paymentstatus',
      'eventtype',
      'type',
      'transactiontype',
      'state',
      'estado',
    ],
    contains: ['status'],
    not: ['fulfil', 'ship'],
  },
  currency: {
    exact: ['currency', 'currencycode', 'moneda', 'wahrung', 'devise', 'valuta'],
    contains: ['currency'],
  },
  discount: {
    exact: [
      'discount',
      'discounts',
      'discountamount',
      'promotion',
      'coupon',
      'couponamount',
      'markdown',
      'descuento',
      'rabatt',
      'remise',
    ],
    contains: ['discount'],
    not: ['code', 'name', 'rate', 'percent', 'pct'],
  },
  refund: {
    exact: [
      'refund',
      'refunds',
      'refunded',
      'refundedamount',
      'amountrefunded',
      'refundamount',
      'returns',
      'returnamount',
    ],
    contains: ['refund'],
  },
  cost: {
    exact: [
      'cost',
      'unitcost',
      'costprice',
      'costperitem',
      'cogs',
      'productcost',
      'itemcost',
      'purchaseprice',
      'buyprice',
      'wholesale',
      'wholesaleprice',
      'costo',
      'kosten',
    ],
    contains: ['cost', 'cogs'],
    not: ['shipping', 'total'],
  },
  profit: {
    exact: ['profit', 'grossprofit', 'netprofit', 'margin', 'earnings'],
    contains: ['profit'],
    not: ['percent', 'pct', 'rate'],
  },
  category: {
    exact: [
      'category',
      'productcategory',
      'type',
      'producttype',
      'department',
      'collection',
      'vendor',
      'brand',
      'channel',
      'saleschannel',
      'source',
      'segment',
      'group',
      'categoria',
      'kategorie',
      'line',
      'productline',
    ],
    contains: ['category', 'department', 'channel', 'brand', 'vendor'],
    not: ['id', 'code'],
  },
  cancelled: {
    exact: ['cancelledat', 'canceledat', 'cancelled', 'canceled', 'cancelleddate'],
    contains: ['cancel'],
  },
};
export const MONEY: Role[] = ['amount', 'price', 'discount', 'refund', 'cost', 'profit'];

export interface ColStats {
  email: number;
  percent: number;
  numeric: number;
  integer: number;
  date: number;
  serial: number;
  distinct: number;
  country: number;
  code3: number;
  avgLen: number;
  n: number;
  status: number;
  negatives: number;
}
export function colStats(values: string[]): ColStats {
  const v = values.filter((x) => !blank(x)).slice(0, 600);
  const n = v.length || 1,
    dc = detectDecimalComma(v);
  const nums = v.map((x) => parseNumber(x, dc));
  const order = detectDateOrder(v)?.order ?? 'mdy';
  return {
    percent: v.filter((x) => /%\s*$/.test(x)).length / n,
    email: v.filter((x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x.trim())).length / n,
    n: v.length,
    numeric: nums.filter((x) => x !== null).length / n,
    integer: nums.filter((x) => x !== null && Number.isInteger(x)).length / n,
    negatives: nums.filter((x) => x !== null && x < 0).length / n,
    date:
      v.filter(
        (x) =>
          parseDate(x, order) !== null && !/^\d{1,6}(\.\d+)?$/.test(x.trim()) && !/^\d{4}$/.test(x.trim()),
      ).length / n,
    serial: v.filter((x) => /^\d{5}(\.\d+)?$/.test(x.trim()) && +x > 25000 && +x < 80000).length / n,
    distinct: new Set(v).size,
    country: v.filter((x) => COUNTRIES.has(x.trim().toLowerCase())).length / n,
    code3: v.filter((x) => CURRENCY_CODES.has(x.trim().toUpperCase())).length / n,
    status:
      v.filter(
        (x) =>
          STATUS_DROP.test(x) ||
          STATUS_RETURN.test(x) ||
          STATUS_REFUNDED.test(x) ||
          /^(paid|complete|completed|shipped|delivered|processing|pending|authorized|succeeded|payment|sale|fulfilled|partially\s*refunded|open|closed)$/i.test(
            x.trim(),
          ),
      ).length / n,
    avgLen: v.reduce((s, x) => s + x.length, 0) / n,
  };
}

/** Words in a header: "Total Paid" → total, paid; "customerID" → customer, id; "ship_country" → ship, country. */
export const words = (h: string) =>
  h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Header keywords in scripts that have no Latin letters (Japanese, Chinese, Korean, Russian, Arabic). */
export const NATIVE: Partial<Record<Role, RegExp>> = {
  date: /日付|日期|注文日|購入日|날짜|일자|дата|تاريخ/iu,
  order: /注文番号|注文ID|订单号|订单编号|订单|주문번호|номер заказа|заказ|رقم الطلب/iu,
  product: /商品|产品|製品|品名|品目|상품|제품|товар|продукт|наименование|منتج/iu,
  customer: /顧客|客户|お客様|購入者|고객|구매자|клиент|покупатель|عميل/iu,
  quantity: /数量|個数|수량|количество|кол-во|كمية/iu,
  price: /単価|单价|단가|цена|سعر/iu,
  amount: /金額|金额|売上|销售额|合計|总计|小計|금액|매출|합계|сумма|выручка|итого|المبلغ|الإجمالي/iu,
  country: /国|国家|국가|страна|البلد|الدولة/iu,
  cost: /原価|成本|원가|себестоимость|التكلفة/iu,
};

export function nameScore(role: Role, h: string): number {
  const k = norm(h),
    spec = NAMES[role];
  if (!k) return NATIVE[role]?.test(h) ? 0.9 : 0;
  const w = words(h);
  if (spec.exact.includes(k)) return 1;
  if (spec.not?.some((t) => w.some((x) => x.startsWith(t)))) return 0;
  if (spec.contains.some((t) => k.includes(t))) return 0.7;
  if (NATIVE[role]?.test(h)) return 0.9;
  return 0;
}

/** Do the values suit the role? A clearly named column gets more slack, so a few bad cells are reported rather than the column being ignored. */
export function fits(role: Role, s: ColStats, rows: number, named = false): boolean {
  if (!s.n) return false;
  const k = named ? 0.6 : 1;
  switch (role) {
    case 'date':
      return s.date >= 0.7 * k || (named && s.serial >= 0.9);
    case 'quantity':
      return s.numeric >= 0.9 * k && s.integer >= 0.85 * k;
    case 'amount':
    case 'price':
    case 'cost':
    case 'profit':
      return s.numeric >= 0.85 * k && s.percent < 0.3;
    case 'discount':
    case 'refund':
      return s.numeric >= 0.85 * k && s.percent < 0.3;
    case 'currency':
      return s.code3 >= 0.8;
    case 'country':
      return s.numeric < 0.2;
    case 'status':
      return s.numeric < 0.2 && s.distinct <= 40;
    case 'category':
      return s.numeric < 0.3 && s.distinct >= 2 && s.distinct <= Math.max(60, rows * 0.05);
    case 'cancelled':
      return true;
    case 'product':
      return s.numeric < 0.5 && s.distinct >= (named ? 1 : 2);
    case 'customer':
      return s.distinct >= (named ? 1 : 2);
    case 'order':
      return s.distinct >= (named ? 1 : 2);
    default:
      return true;
  }
}

export function detectRoles(
  t: Table,
  profile: Profile | null,
  overrides: Partial<Record<Role, string | null>>,
): { roles: RoleMap; confidence: Partial<Record<Role, number>> } {
  const roles: RoleMap = {},
    confidence: Partial<Record<Role, number>> = {},
    used = new Set<string>();
  const byNorm = new Map(t.headers.map((h) => [norm(h), h]));
  const stats = new Map(t.headers.map((h, j) => [h, colStats(t.rows.map((r) => r[j]))]));
  for (const [role, col] of Object.entries(overrides) as [Role, string | null][]) {
    if (col === null) {
      used.add(`__none_${role}`);
      continue;
    }
    if (t.headers.includes(col)) {
      roles[role] = col;
      confidence[role] = 1;
      used.add(col);
    }
  }
  const skip = (role: Role) => roles[role] !== undefined || used.has(`__none_${role}`);
  if (profile)
    for (const [role, names] of Object.entries(profile.roles) as [Role, string[]][]) {
      if (skip(role)) continue;
      const col = names.map((n) => byNorm.get(n)).find((c) => c && !used.has(c));
      if (col) {
        roles[role] = col;
        confidence[role] = 0.99;
        used.add(col);
      }
    }
  // Score every (role, column) pair: name evidence + whether the values look right.
  const cand: { role: Role; col: string; score: number }[] = [];
  // A recognized platform's own map is authoritative; only look for extras it doesn't define (e.g. costs).
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
  const amountRank = [
    'netsales',
    'linetotal',
    'itemtotal',
    'netamount',
    'sales',
    'revenue',
    'amount',
    'total',
    'totalprice',
    'ordertotal',
    'subtotal',
    'grosssales',
  ];
  for (const c of cand)
    if (c.role === 'amount') {
      const i = amountRank.indexOf(norm(c.col));
      if (i >= 0) c.score += (amountRank.length - i) * 0.002;
    }
  cand.sort((a, b) => b.score - a.score);
  for (const c of cand) {
    if (skip(c.role) || used.has(c.col) || c.score < 0.45) continue;
    roles[c.role] = c.col;
    confidence[c.role] = Math.min(0.97, c.score);
    used.add(c.col);
  }
  // A column named like a price but holding line totals (price ≈ amount / qty) — keep both only if they differ.
  // Fallback money: no named money column → the numeric, mostly non-integer column with the widest spread.
  // Fallback product: the most varied remaining text column (shown to the person to confirm).
  if (!roles.product && !used.has('__none_product') && !profile) {
    const pick = t.headers
      .filter((h) => !used.has(h))
      .map((h) => ({ h, s: stats.get(h)! }))
      .filter(
        ({ s, h }) =>
          s.numeric < 0.2 &&
          s.date < 0.2 &&
          s.country < 0.5 &&
          s.code3 < 0.5 &&
          s.status < 0.5 &&
          s.email < 0.5 &&
          s.distinct >= 2 &&
          s.avgLen >= 3 &&
          s.avgLen <= 80 &&
          !/email|phone|address|zip|postal|note|comment|tag|url|link/i.test(h),
      )
      // products repeat across sales more than customers or notes do: prefer the column whose values repeat most (but not a 2-value flag)
      .sort((a, b) => {
        const flag = (x: ColStats) => (t.rows.length >= 30 && x.distinct < 3 ? 1 : 0);
        return flag(a.s) - flag(b.s) || a.s.distinct - b.s.distinct;
      })[0];
    if (pick) {
      roles.product = pick.h;
      confidence.product = 0.45;
      used.add(pick.h);
    }
  }
  if (!roles.amount && !roles.price && !used.has('__none_amount') && !used.has('__none_price') && !profile) {
    const pick = t.headers
      .filter((h) => !used.has(h))
      .map((h) => ({ h, s: stats.get(h)! }))
      .filter(
        ({ s, h }) =>
          s.numeric >= 0.95 && s.integer < 0.9 && !/id|code|zip|postal|phone|year|lat|lon/i.test(h),
      )
      .sort((a, b) => 1 - b.s.integer - (1 - a.s.integer))[0];
    if (pick) {
      roles.amount = pick.h;
      confidence.amount = 0.4;
      used.add(pick.h);
    }
  }
  // Unnamed quantity: a column of small whole numbers that isn't a running ID.
  if (!roles.quantity && !used.has('__none_quantity') && !profile) {
    const pick = t.headers
      .filter((h) => !used.has(h))
      .find((h) => {
        const j = t.headers.indexOf(h),
          s = stats.get(h)!;
        if (s.numeric < 0.95 || s.integer < 0.98 || /id|code|zip|postal|phone|year|no$|number|#/i.test(h))
          return false;
        const v = t.rows
          .slice(0, 500)
          .map((r) => parseNumber(r[j]))
          .filter((x): x is number => x !== null);
        const max = Math.max(...v),
          min = Math.min(...v);
        let rising = 0;
        for (let i = 1; i < v.length; i++) if (v[i] > v[i - 1]) rising++;
        return max <= 1000 && min >= -1000 && new Set(v).size <= 60 && rising < v.length * 0.9;
      });
    if (pick) {
      roles.quantity = pick;
      confidence.quantity = 0.45;
      used.add(pick);
    }
  }
  // A guessed money column next to a quantity: unit price or line total? If a product's amount stays the same
  // whatever the quantity, it's a unit price.
  if (roles.amount && roles.quantity && !roles.price && (confidence.amount ?? 1) < 0.9 && roles.product) {
    const ja = t.headers.indexOf(roles.amount),
      jq = t.headers.indexOf(roles.quantity),
      jp = t.headers.indexOf(roles.product);
    const byP = new Map<string, Set<string>>(),
      qtyVaries = new Map<string, Set<string>>();
    for (const r of t.rows.slice(0, 3000)) {
      (byP.get(r[jp]) ?? byP.set(r[jp], new Set()).get(r[jp])!).add(r[ja]);
      (qtyVaries.get(r[jp]) ?? qtyVaries.set(r[jp], new Set()).get(r[jp])!).add(r[jq]);
    }
    const groups = [...byP.keys()].filter((p) => qtyVaries.get(p)!.size >= 2);
    if (groups.length && groups.filter((p) => byP.get(p)!.size === 1).length / groups.length >= 0.7) {
      roles.price = roles.amount;
      confidence.price = confidence.amount;
      delete roles.amount;
      delete confidence.amount;
    }
  }
  return { roles, confidence };
}
