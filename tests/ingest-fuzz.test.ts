import { describe, it, expect } from 'vitest';
import { ingest } from '@blindspot/analytics';

/**
 * Ground-truth round trips: random orders with known totals are written out in each platform's real
 * file layout (with realistic mess), read back, and every total must match to the cent.
 */
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
interface Line { product: string; sku: string; qty: number; price: number }
interface Order { id: string; date: string; customer: string; country: string; lines: Line[]; status: 'paid' | 'refunded' | 'cancelled'; discount: number }

const PRODUCTS = [['Neck Massager, Black', 'NM-1', 39.99], ['Foot Spa', 'FS-2', 59], ['Heat Pad "XL"', 'HP-3', 24.5], ['Café Mug', 'CM-4', 12], ['Yoga Mat', 'YM-5', 1299.95]] as const;
const COUNTRIES = ['United States', 'United Kingdom', 'Germany', 'France', 'Canada'];

function makeOrders(n: number, seed: number): Order[] {
  const r = rng(seed), out: Order[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2025, 0, 1) + Math.floor(r() * 600) * 86400000).toISOString().slice(0, 10);
    const k = 1 + Math.floor(r() * 3), lines: Line[] = [];
    const used = new Set<number>();
    for (let j = 0; j < k; j++) { let p = Math.floor(r() * PRODUCTS.length); while (used.has(p)) p = (p + 1) % PRODUCTS.length; used.add(p); lines.push({ product: PRODUCTS[p][0], sku: PRODUCTS[p][1], qty: 1 + Math.floor(r() * 4), price: PRODUCTS[p][2] }); }
    const x = r();
    out.push({ id: `#${1001 + i}`, date: d, customer: `cust${Math.floor(r() * n / 3)}@shop.com`, country: COUNTRIES[Math.floor(r() * COUNTRIES.length)], lines, status: x < 0.05 ? 'cancelled' : x < 0.1 ? 'refunded' : 'paid', discount: r() < 0.2 ? 5 : 0 });
  }
  return out;
}
const gross = (o: Order) => o.lines.reduce((s, l) => s + l.qty * l.price, 0);
const truth = (orders: Order[], withDiscount: boolean) => {
  const live = orders.filter((o) => o.status !== 'cancelled');
  const sales = live.reduce((s, o) => s + gross(o) - (withDiscount ? o.discount : 0), 0);
  const refunds = live.filter((o) => o.status === 'refunded').reduce((s, o) => s + gross(o) - (withDiscount ? o.discount : 0), 0);
  return { sales: Math.round(sales * 100) / 100, refunds: Math.round(refunds * 100) / 100, orders: live.length, customers: new Set(live.map((o) => o.customer)).size };
};
const q = (v: string | number) => { const s = String(v); return /[,"\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const measure = (rows: any[]) => ({
  sales: Math.round(rows.filter((r) => r.IsReturn !== 1).reduce((s, r) => s + r.Sales, 0) * 100) / 100,
  refunds: Math.round(-rows.filter((r) => r.IsReturn === 1).reduce((s, r) => s + r.Sales, 0) * 100) / 100,
  orders: new Set(rows.filter((r) => r.IsReturn !== 1).map((r) => r.Order)).size,
  customers: new Set(rows.map((r) => r.Customer).filter((c) => c !== 'Unknown customer')).size,
});
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.05 + Math.abs(b) * 1e-9);

describe.each([1, 2, 3])('round trips (seed %i)', (seed) => {
  const orders = makeOrders(1500, seed);

  it('Shopify export: multi-line orders, order discounts, refunds, cancellations, GBP', () => {
    const H = 'Name,Email,Financial Status,Paid at,Currency,Subtotal,Shipping,Taxes,Total,Discount Amount,Created at,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku,Billing Name,Shipping Country,Cancelled at,Refunded Amount,Vendor';
    const rows = [H];
    for (const o of orders) o.lines.forEach((l, j) => {
      const first = j === 0, g = gross(o) - o.discount;
      rows.push([o.id, first ? o.customer : '', first ? (o.status === 'cancelled' ? 'voided' : o.status) : '', first ? `${o.date} 12:00:00 +0000` : '', first ? 'GBP' : '', first ? g.toFixed(2) : '', first ? '4.99' : '', first ? '1.00' : '', first ? (g + 5.99).toFixed(2) : '', first ? o.discount.toFixed(2) : '',
        first ? `${o.date} 11:59:00 -0500` : '', l.qty, l.product, l.price.toFixed(2), l.sku, first ? 'Name' : '', first ? o.country : '', first && o.status === 'cancelled' ? `${o.date} 13:00:00 +0000` : '', first && o.status === 'refunded' ? g.toFixed(2) : '', 'Acme'].map(q).join(','));
    });
    const { dataset, report } = ingest([{ name: 'orders_export.csv', text: rows.join('\n') }]);
    const t = truth(orders, true), m = measure(dataset.rows);
    close(m.sales, t.sales); close(m.refunds, t.refunds);
    expect(m.orders).toBe(t.orders); expect(m.customers).toBe(t.customers);
    expect(report.currency).toBe('GBP');
  });

  it('European semicolon file: decimal commas, day-first dates, € symbols, title lines, totals', () => {
    const rows = ['Verkaufsbericht;;;;;;', ';;;;;;', 'Bestellnummer;Datum;Artikel;Menge;Einzelpreis;Kunde;Land'];
    let tot = 0;
    for (const o of orders) { if (o.status === 'cancelled') continue; for (const l of o.lines) {
      const [y, mo, d] = o.date.split('-');
      rows.push([o.id, `${d}.${mo}.${y}`, l.product, l.qty, `${l.price.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`, o.customer, o.country].map(q).join(';'));
      tot += l.qty * l.price;
    } }
    rows.push(`Summe;;;;${tot.toFixed(2).replace('.', ',')} €;;`);
    const { dataset, report } = ingest([{ name: 'bericht.csv', text: rows.join('\n') }]);
    const t = truth(orders.map((o) => (o.status === 'refunded' ? { ...o, status: 'paid' as const } : o)), false), m = measure(dataset.rows);
    close(m.sales, t.sales);
    expect(report.dateOrder).toBe('dmy'); expect(report.currency).toBe('EUR');
    expect(m.orders).toBe(t.orders);
  });

  it('US spreadsheet with order total repeated on each line, $ symbols, month-first dates, refund rows', () => {
    const rows = ['Order ID,Order Date,Customer Email,Product Name,Quantity,Unit Price,Order Total,Status'];
    for (const o of orders) { if (o.status === 'cancelled') continue; for (const l of o.lines) {
      const [y, mo, d] = o.date.split('-');
      rows.push([o.id.slice(1), `${+mo}/${+d}/${y}`, o.customer, l.product, l.qty, `$${l.price.toFixed(2)}`, `$${gross(o).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, o.status === 'refunded' ? 'Refunded' : 'Completed'].map(q).join(','));
    } }
    const { dataset, report } = ingest([{ name: 'orders.csv', text: rows.join('\n') }]);
    const t = truth(orders, false), m = measure(dataset.rows);
    close(m.sales, t.sales); close(m.refunds, t.refunds);
    expect(m.customers).toBe(t.customers);
    expect(report.issues.some((i) => i.kind === 'order-total')).toBe(true);
  });

  it('Etsy-style with 2-digit years and an Item Total column', () => {
    const rows = ['Sale Date,Item Name,Buyer,Quantity,Price,Item Total,Currency,Order ID,Ship Country'];
    for (const o of orders) { if (o.status === 'cancelled') continue; for (const l of o.lines) {
      const [y, mo, d] = o.date.split('-');
      rows.push([`${mo}/${d}/${y.slice(2)}`, l.product, o.customer, l.qty, l.price.toFixed(2), (l.qty * l.price).toFixed(2), 'USD', o.id.slice(1), o.country].map(q).join(','));
    } }
    const { dataset } = ingest([{ name: 'EtsySoldOrderItems.csv', text: rows.join('\n') }]);
    const t = truth(orders.map((o) => (o.status === 'refunded' ? { ...o, status: 'paid' as const } : o)), false), m = measure(dataset.rows);
    close(m.sales, t.sales); expect(m.orders).toBe(t.orders);
  });

  it('Excel-exported file: serial dates, 1001.0 ids, no order numbers', () => {
    const rows = ['Date,Customer,Item,Qty,Line Total'];
    for (const o of orders) { if (o.status === 'cancelled') continue; for (const l of o.lines) {
      const serial = Math.round((Date.parse(o.date) - Date.UTC(1899, 11, 30)) / 86400000);
      rows.push([serial, o.customer, l.product, `${l.qty}.0`, (l.qty * l.price).toFixed(2)].map(q).join(','));
    } }
    const { dataset, report } = ingest([{ name: 'export.csv', text: rows.join('\n') }]);
    const t = truth(orders.map((o) => (o.status === 'refunded' ? { ...o, status: 'paid' as const } : o)), false), m = measure(dataset.rows);
    close(m.sales, t.sales);
    expect(report.unlocks.find((u) => u.key === 'orders')!.ok).toBe('partial');
    expect(dataset.rows[0].OrderDate).toMatch(/^202[56]-\d\d-\d\d$/);
  });
});

describe('scale', () => {
  it('reads 150,000 lines in a few seconds', () => {
    const orders = makeOrders(80000, 9);
    const rows = ['Order,Date,Customer,Product,Qty,Price'];
    for (const o of orders) for (const l of o.lines) rows.push([o.id, o.date, o.customer, l.product, l.qty, l.price].map(q).join(','));
    const t0 = Date.now();
    const { dataset } = ingest([{ name: 'big.csv', text: rows.slice(0, 150001).join('\n') }]);
    expect(dataset.rows.length).toBeGreaterThan(140000);
    expect(Date.now() - t0).toBeLessThan(20000); // ~3s on an idle laptop; slack for busy CI machines
  });
});
