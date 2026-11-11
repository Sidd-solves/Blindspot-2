import type { Dataset, Row } from './types';

/** Shape of the Admin GraphQL order fields Blindspot requests (see services/api/src/shopify.ts). */
export interface ShopifyOrderNode {
  name: string; createdAt: string; cancelledAt: string | null; test: boolean;
  displayFinancialStatus: string | null;
  customer: { id: string; displayName: string } | null;
  shippingAddress: { provinceCode: string | null; countryCodeV2: string | null } | null;
  lineItems: { edges: { node: {
    title: string; quantity: number; vendor: string | null;
    originalTotalSet: { shopMoney: { amount: string } };
    discountedTotalSet: { shopMoney: { amount: string } };
    product: { productType: string | null } | null;
    variant: { inventoryItem: { unitCost: { amount: string } | null } | null } | null;
  } }[] };
}

const num = (s: string | null | undefined) => (s == null || s === '' ? NaN : parseFloat(s));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** One row per line item. Cancelled and test orders are dropped. Profit is only added when unit costs cover most sales. */
export function shopifyOrdersToDataset(orders: ShopifyOrderNode[], shop: string): Dataset {
  const rows: Row[] = [];
  let withCost = 0, total = 0;
  for (const o of orders) {
    if (o.cancelledAt || o.test) continue;
    for (const { node: li } of o.lineItems.edges) {
      const sales = num(li.discountedTotalSet.shopMoney.amount), original = num(li.originalTotalSet.shopMoney.amount);
      const unitCost = num(li.variant?.inventoryItem?.unitCost?.amount);
      total++;
      if (Number.isFinite(unitCost)) withCost++;
      rows.push({
        OrderDate: o.createdAt.slice(0, 10), Order: o.name,
        Customer: o.customer?.displayName || 'Guest checkout',
        Region: o.shippingAddress?.provinceCode || o.shippingAddress?.countryCodeV2 || 'No shipping address',
        Category: li.product?.productType || 'Uncategorized', Product: li.title, Vendor: li.vendor || 'Unknown',
        Quantity: li.quantity,
        Discount: original > 0 ? r2(1 - sales / original) : 0,
        Sales: r2(sales),
        Profit: Number.isFinite(unitCost) ? r2(sales - unitCost * li.quantity) : null,
        PaymentStatus: o.displayFinancialStatus ?? 'UNKNOWN',
      });
    }
  }
  const costCoverage = total ? withCost / total : 0;
  if (costCoverage < 0.6) rows.forEach((r) => delete r.Profit); // too few costs to report profit honestly
  return {
    name: `${shop} (Shopify)`, source: 'shopify',
    label: costCoverage >= 0.6 ? 'Live Shopify store data' : 'Live Shopify store data (no product costs, so profit is hidden)',
    rows,
  };
}

/** Shopify admin "Orders → Export" CSV: one row per line item, order fields only on the first line of each order. */
export function isShopifyOrderExport(rows: Row[]) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return ['Name', 'Created at', 'Lineitem name', 'Lineitem quantity', 'Lineitem price'].every((c) => cols.includes(c));
}

export function shopifyExportToDataset(rows: Row[], name = 'Shopify order export'): Dataset {
  const out: Row[] = [];
  let cur: Row | null = null;
  const byOrder = new Map<string, Row[]>();
  for (const r of rows) {
    if (r['Created at']) cur = r; // first line of an order carries order-level fields
    if (!cur) continue;
    const qty = Number(r['Lineitem quantity'] ?? 0), price = Number(r['Lineitem price'] ?? 0);
    const line: Row = {
      OrderDate: String(cur['Created at']).slice(0, 10), Order: String(r['Name'] ?? cur['Name']),
      Customer: String(cur['Billing Name'] || cur['Email'] || 'Guest checkout'),
      Region: String(cur['Shipping Province'] || cur['Shipping Country'] || 'No shipping address'),
      Product: String(r['Lineitem name']), Vendor: String(r['Vendor'] || 'Unknown'),
      Quantity: qty, Sales: r2(qty * price), Discount: 0,
      PaymentStatus: String(cur['Financial Status'] || 'unknown'),
    };
    if (String(cur['Cancelled at'] ?? '')) continue;
    out.push(line);
    const k = String(line.Order);
    byOrder.set(k, [...(byOrder.get(k) ?? []), line]);
  }
  // Spread each order's discount across its lines in proportion to line value.
  for (const r of rows) {
    if (!r['Created at']) continue;
    const disc = Number(r['Discount Amount'] ?? 0), lines = byOrder.get(String(r['Name'])) ?? [];
    const gross = lines.reduce((s, l) => s + (l.Sales as number), 0);
    if (disc > 0 && gross > 0) for (const l of lines) { const share = ((l.Sales as number) / gross) * disc; l.Discount = r2(share / (l.Sales as number)); l.Sales = r2((l.Sales as number) - share); }
  }
  return { name, source: 'csv', label: 'Shopify order export (no product costs, so profit is hidden)', rows: out };
}
