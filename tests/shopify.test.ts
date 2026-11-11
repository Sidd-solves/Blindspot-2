import { describe, it, expect } from 'vitest';
import { shopifyOrdersToDataset, parseCsv, analyzeSmart, type ShopifyOrderNode } from '@blindspot/analytics';
import { normalizeShop } from '../services/api/src/shopify';

const money = (a: string) => ({ shopMoney: { amount: a } });
const li = (title: string, qty: number, orig: string, disc: string, cost: string | null, type: string | null = 'Massagers', deleted = false) => ({ node: {
  title, quantity: qty, vendor: 'Demo Shop', originalTotalSet: money(orig), discountedTotalSet: money(disc),
  product: deleted ? null : { productType: type }, variant: deleted ? null : { inventoryItem: { unitCost: cost === null ? null : { amount: cost } } },
} });
const order = (name: string, date: string, extra: Partial<ShopifyOrderNode> = {}, lines = [li('Neck Massager', 1, '100.00', '80.00', '30.00')]): ShopifyOrderNode => ({
  name, createdAt: `${date}T10:00:00Z`, cancelledAt: null, test: false, displayFinancialStatus: 'PAID',
  customer: { id: 'gid://shopify/Customer/1', displayName: 'Alex Demo' }, shippingAddress: { provinceCode: 'TX', countryCodeV2: 'US' },
  lineItems: { edges: lines }, ...extra,
});

describe('Shopify connector', () => {
  it('maps line items to rows with discount and real profit from unit cost', () => {
    const ds = shopifyOrdersToDataset([order('#1001', '2026-01-05')], 'demo');
    expect(ds.source).toBe('shopify');
    expect(ds.rows[0]).toMatchObject({ OrderDate: '2026-01-05', Region: 'TX', Category: 'Massagers', Sales: 80, Discount: 0.2, Profit: 50, Quantity: 1 });
  });
  it('drops cancelled and test orders, and handles deleted products and guest checkout', () => {
    const ds = shopifyOrdersToDataset([
      order('#1', '2026-01-01', { cancelledAt: '2026-01-02T00:00:00Z' }),
      order('#2', '2026-01-01', { test: true }),
      order('#3', '2026-01-01', { customer: null, shippingAddress: null }, [li('Old item', 2, '50', '50', null, null, true), li('New item', 1, '40', '40', '10', '')]),
    ], 'demo');
    expect(ds.rows.map((r) => r.Order)).toEqual(['#3', '#3']);
    expect(ds.rows[0]).toMatchObject({ Customer: 'Guest checkout', Region: 'No shipping address', Category: 'Uncategorized' });
  });
  it('hides Profit when most items have no cost, instead of reporting fake margins', () => {
    const ds = shopifyOrdersToDataset([order('#1', '2026-01-01', {}, [li('A', 1, '10', '10', null), li('B', 1, '10', '10', null), li('C', 1, '10', '10', '2')])], 'demo');
    expect('Profit' in ds.rows[0]).toBe(false);
    expect(ds.label).toMatch(/profit is hidden/);
  });
  it('feeds the analysis engine: finds a loss-making product from Shopify data', () => {
    const orders = Array.from({ length: 60 }, (_, i) => order(`#${i}`, `2026-0${1 + (i % 6)}-1${i % 9}`, { customer: { id: String(i), displayName: `Customer ${i % 12}` } },
      [li('Neck Massager', 1, '100', '90', '30'), li('Foot Spa', 1, '60', '30', '45', 'Spa')]));
    const f = analyzeSmart(shopifyOrdersToDataset(orders, 'demo'));
    expect(f.some((x) => x.category === 'profitability' && /Foot Spa|Spa/.test(x.title))).toBe(true);
  });
  it('auto-detects the Shopify admin order export CSV and spreads order discounts', () => {
    const csv = ['Name,Email,Financial Status,Created at,Lineitem quantity,Lineitem name,Lineitem price,Discount Amount,Billing Name,Shipping Province,Vendor,Cancelled at',
      '#1001,a@x.com,paid,2026-02-01 10:00:00 -0600,2,Neck Massager,50,20,Alex Demo,TX,Demo Shop,',
      '#1001,,,,1,Foot Spa,100,,,,Demo Shop,',
      '#1002,b@x.com,paid,2026-02-03 09:00:00 -0600,1,Foot Spa,100,0,Sam Demo,CA,Demo Shop,'].join('\n');
    const ds = parseCsv(csv, 'orders_export.csv');
    expect(ds.rows).toHaveLength(3);
    expect(ds.rows[1]).toMatchObject({ Order: '#1001', Customer: 'a@x.com', Region: 'TX', Product: 'Foot Spa', Sales: 90, IsReturn: 0 });
    expect(ds.rows[0].Sales).toBe(90);
  });
  it('normalizes and validates store addresses', () => {
    expect(normalizeShop('https://My-Store.myshopify.com/admin')).toBe('my-store.myshopify.com');
    expect(normalizeShop('my-store')).toBe('my-store.myshopify.com');
    expect(() => normalizeShop('evil.com/../x')).toThrow();
  });
});
