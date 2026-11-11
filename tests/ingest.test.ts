import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ingest, parseCsvLegacy, parseNumber, parseDate, detectDateOrder, IngestError, type IngestReport } from '@blindspot/analytics';

const sales = (rows: any[]) => Math.round(rows.filter((r) => r.IsReturn !== 1).reduce((s, r) => s + r.Sales, 0) * 100) / 100;
const returns = (rows: any[]) => Math.round(rows.filter((r) => r.IsReturn === 1).reduce((s, r) => s + r.Sales, 0) * 100) / 100;
const run = (text: string, name = 'f.csv', opts = {}) => ingest([{ name, text }], opts);
const issue = (rep: IngestReport, kind: string) => rep.issues.find((i) => i.kind === kind);

describe('value readers', () => {
  it('reads money in every common format', () => {
    expect(parseNumber('£1,234.50')).toBe(1234.5);
    expect(parseNumber('1.234,50 €', true)).toBe(1234.5);
    expect(parseNumber('(12.00)')).toBe(-12);
    expect(parseNumber('12.00-')).toBe(-12);
    expect(parseNumber('USD 9.99')).toBe(9.99);
    expect(parseNumber('−3')).toBe(-3);
    expect(parseNumber('-$4.50')).toBe(-4.5);
    expect(parseNumber('$-4.50')).toBe(-4.5);
    expect(parseNumber('1 234,5', true)).toBe(1234.5);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('1,000')).toBe(1000);
    expect(parseNumber('R$ 10,00', true)).toBe(10);
    expect(parseNumber('₹1,23,456')).toBe(123456);
    expect(parseNumber('2 x Hoodie')).toBeNull();
    expect(parseNumber('N/A')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
  it('reads dates in every common format, keeping the day as written', () => {
    expect(parseDate('2026-03-01 23:59:00 -0500')).toBe('2026-03-01');
    expect(parseDate('2026-10-01T14:22:31+00:00')).toBe('2026-10-01');
    expect(parseDate('3/14/2026')).toBe('2026-03-14');
    expect(parseDate('14/03/2026', 'dmy')).toBe('2026-03-14');
    expect(parseDate('01.12.2009', 'dmy')).toBe('2009-12-01');
    expect(parseDate('10/03/26', 'mdy')).toBe('2026-10-03');
    expect(parseDate('01-Dec-2009')).toBe('2009-12-01');
    expect(parseDate('Dec 1, 2009')).toBe('2009-12-01');
    expect(parseDate('Tuesday, December 1, 2009')).toBe('2009-12-01');
    expect(parseDate('1 décembre 2009')).toBe('2009-12-01');
    expect(parseDate('20091201')).toBe('2009-12-01');
    expect(parseDate('46096', 'mdy', true)).toBe('2026-03-15');
    expect(parseDate('31/02/2026', 'dmy')).toBeNull();
    expect(parseDate('hello')).toBeNull();
  });
  it('works out day-first vs month-first from the whole column', () => {
    expect(detectDateOrder(['01/02/2026', '25/02/2026'])).toEqual({ order: 'dmy', assumed: false });
    expect(detectDateOrder(['01/02/2026', '02/25/2026'])).toEqual({ order: 'mdy', assumed: false });
    expect(detectDateOrder(['01/02/2026', '03/04/2026'])?.assumed).toBe(true);
  });
});

describe('Shopify order export (real column layout)', () => {
  const H = 'Name,Email,Financial Status,Paid at,Fulfillment Status,Fulfilled at,Accepts Marketing,Currency,Subtotal,Shipping,Taxes,Total,Discount Code,Discount Amount,Shipping Method,Created at,Lineitem quantity,Lineitem name,Lineitem price,Lineitem compare at price,Lineitem sku,Lineitem requires shipping,Lineitem taxable,Lineitem fulfillment status,Billing Name,Billing Street,Billing Address1,Billing Address2,Billing Company,Billing City,Billing Zip,Billing Province,Billing Country,Billing Phone,Shipping Name,Shipping Street,Shipping Address1,Shipping Address2,Shipping Company,Shipping City,Shipping Zip,Shipping Province,Shipping Country,Shipping Phone,Notes,Note Attributes,Cancelled at,Payment Method,Payment Reference,Refunded Amount,Vendor,Id,Tags,Risk Level,Source,Lineitem discount';
  const row = (o: Record<string, string>) => H.split(',').map((h) => { const v = o[h] ?? ''; return /[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',');
  const csv = [H,
    row({ Name: '#1001', Email: 'ana@x.com', 'Financial Status': 'paid', Currency: 'GBP', Subtotal: '80.00', Shipping: '4.99', Total: '84.99', 'Discount Amount': '10.00', 'Created at': '2026-03-01 23:59:00 +0000', 'Lineitem quantity': '2', 'Lineitem name': 'Neck Massager - Black', 'Lineitem price': '30.00', 'Lineitem sku': 'NM-BLK', 'Billing Name': 'Ana Silva', 'Shipping Province': 'ENG', 'Shipping Country': 'GB', Vendor: 'Acme' }),
    row({ Name: '#1001', 'Lineitem quantity': '1', 'Lineitem name': 'Foot Spa', 'Lineitem price': '30.00', 'Lineitem sku': 'FS-1', Vendor: 'Acme' }),
    row({ Name: '#1002', Email: 'raj@x.com', 'Financial Status': 'refunded', Currency: 'GBP', Total: '45.00', 'Created at': '2026-03-02 10:00:00 +0000', 'Lineitem quantity': '1', 'Lineitem name': 'Foot Spa', 'Lineitem price': '45.00', 'Shipping Country': 'GB', 'Refunded Amount': '45.00', Vendor: 'Acme' }),
    row({ Name: '#1003', Email: 'lee@x.com', 'Financial Status': 'voided', Currency: 'GBP', Total: '99.00', 'Created at': '2026-03-03 10:00:00 +0000', 'Lineitem quantity': '3', 'Lineitem name': 'Neck Massager - Black', 'Lineitem price': '33.00', 'Cancelled at': '2026-03-03 11:00:00 +0000', 'Shipping Country': 'GB', Vendor: 'Acme' }),
    row({ Name: '#1004', Email: 'ana@x.com', 'Financial Status': 'partially_refunded', Currency: 'GBP', Total: '60.00', 'Created at': '2026-04-10 09:00:00 +0000', 'Lineitem quantity': '2', 'Lineitem name': 'Heat Pad, Large', 'Lineitem price': '30.00', 'Shipping Country': 'GB', 'Refunded Amount': '15.00', Vendor: 'Acme' }),
  ].join('\n');
  const { dataset, report } = run(csv, 'orders_export_1.csv');
  it('recognises the format and the currency', () => {
    expect(report.platform).toBe('shopify');
    expect(report.currency).toBe('GBP');
    expect(dataset.currency).toBe('GBP');
  });
  it('carries order details down to every line and spreads the order discount', () => {
    const o1 = dataset.rows.filter((r) => r.Order === '#1001');
    expect(o1).toHaveLength(2);
    expect(o1.every((r) => r.Customer === 'ana@x.com' && r.OrderDate === '2026-03-01' && r.Country === 'GB')).toBe(true);
    expect(sales(o1)).toBe(80); // 60 + 30 − 10 discount
    expect(o1.find((r) => r.Product === 'Foot Spa')!.Sales).toBe(26.67);
  });
  it('drops cancelled orders and books refunds as returns', () => {
    expect(dataset.rows.some((r) => r.Order === '#1003')).toBe(false);
    expect(sales(dataset.rows)).toBe(80 + 45 + 60);
    expect(returns(dataset.rows)).toBe(-60); // 45 full refund + 15 partial
    expect(issue(report, 'cancelled')!.count).toBe(1);
    expect(issue(report, 'refunds')!.count).toBe(2);
  });
  it('keeps product names that contain commas', () => {
    expect(dataset.rows.some((r) => r.Product === 'Heat Pad, Large')).toBe(true);
  });
});

describe('European spreadsheet: semicolons, decimal commas, title rows, totals', () => {
  const csv = ['Umsatzbericht Q1 2026;;;;;;', 'Erstellt am 02.04.2026;;;;;;', ';;;;;;',
    'Bestellnummer;Datum;Artikel;Menge;Preis;Kunde;Land',
    '1001;03.01.2026;Kaffeebecher;2;12,50 €;Müller GmbH;Deutschland',
    '1002;15.01.2026;Teekanne;1;1.249,00 €;Schmidt;Österreich',
    '1003;28.02.2026;Kaffeebecher;-1;12,50 €;Müller GmbH;Deutschland',
    ';;;;;;', 'Gesamt;;;;1.261,50 €;;'].join('\n');
  const { dataset, report } = run(csv);
  it('finds the real header under the title lines and maps German headers', () => {
    expect(report.files[0].headerLine).toBe(4);
    expect(report.roles).toMatchObject({ order: 'Bestellnummer', date: 'Datum', product: 'Artikel', quantity: 'Menge', price: 'Preis', customer: 'Kunde', country: 'Land' });
  });
  it('reads decimal commas, day-first dates and euros', () => {
    expect(report.dateOrder).toBe('dmy');
    expect(report.currency).toBe('EUR');
    expect(sales(dataset.rows)).toBe(1274);
    expect(returns(dataset.rows)).toBe(-12.5);
    expect(dataset.rows.find((r) => r.Order === '1002')!.OrderDate).toBe('2026-01-15');
  });
  it('leaves out the total line instead of counting it', () => {
    expect(issue(report, 'totals')!.count).toBe(1);
    expect(dataset.rows).toHaveLength(3);
  });
});

describe('Etsy sold order items', () => {
  const csv = ['Sale Date,Item Name,Buyer,Quantity,Price,Coupon Code,Coupon Details,Discount Amount,Shipping Discount,Order Shipping,Order Sales Tax,Item Total,Currency,Transaction ID,Listing ID,Date Paid,Date Shipped,Ship Name,Ship Address1,Ship Address2,Ship City,Ship State,Ship Zipcode,Ship Country,Order ID,Variations,Order Type,Listings Type,Payment Type,InPerson Discount,InPerson Location,VAT Paid by Buyer,SKU',
    '10/03/26,Handmade Mug,jane123,2,18.00,,,0,0,5.00,1.20,36.00,USD,3001,9001,10/03/26,10/05/26,Jane D,1 Main St,,Austin,TX,78701,United States,7001,Color:Blue,online,listing,online_cc,,,0,MUG-B',
    '10/17/26,Ceramic Bowl,bob_k,1,24.50,,,0,0,5.00,1.50,24.50,USD,3002,9002,10/17/26,,Bob K,2 Oak St,,Denver,CO,80202,United States,7002,,online,listing,online_cc,,,0,BWL-1',
  ].join('\n');
  const { dataset, report } = run(csv);
  it('maps Etsy columns and reads 2-digit-year dates', () => {
    expect(report.platform).toBe('etsy');
    expect(report.roles).toMatchObject({ date: 'Sale Date', product: 'Item Name', customer: 'Buyer', quantity: 'Quantity', amount: 'Item Total', order: 'Order ID', country: 'Ship Country' });
    expect(dataset.rows.map((r) => r.OrderDate)).toEqual(['2026-10-03', '2026-10-17']);
    expect(sales(dataset.rows)).toBe(60.5);
    expect(report.currency).toBe('USD');
  });
});

describe('Square item sales', () => {
  const H = 'Date,Time,Time Zone,Category,Item,Qty,Price Point Name,SKU,Modifiers Applied,Gross Sales,Discounts,Net Sales,Tax,Transaction ID,Payment ID,Device Name,Notes,Details,Event Type,Location,Dining Option,Customer ID,Customer Name,Customer Reference ID,Unit,Count,Itemization Type';
  const csv = [H,
    '2026-10-03,08:12:44,Central Time (US & Canada),Coffee,Latte,2,Large,LAT-L,,$9.00,$0.00,$9.00,$0.74,T1,P1,iPad,,,Payment,Main St,,C1,Jo Lin,,,2,Physical Item',
    '2026-10-03,09:01:10,Central Time (US & Canada),Bakery,Croissant,1,Regular,CRO,,$3.50,($0.50),$3.00,$0.25,T2,P2,iPad,,,Payment,Main St,,,,,,1,Physical Item',
    '2026-10-04,10:00:00,Central Time (US & Canada),Coffee,Latte,-1,Large,LAT-L,,($4.50),$0.00,($4.50),($0.37),T3,P3,iPad,,,Refund,Main St,,C1,Jo Lin,,,1,Physical Item',
  ].join('\n');
  const { dataset, report } = run(csv);
  it('uses net sales, keeps the category and books the refund as a return', () => {
    expect(report.platform).toBe('square');
    expect(report.roles.amount).toBe('Net Sales');
    expect(sales(dataset.rows)).toBe(12);
    expect(returns(dataset.rows)).toBe(-4.5);
    expect(dataset.rows[0].Category).toBe('Coffee');
    expect(report.currency).toBe('USD');
  });
});

describe('Amazon order report (tab-separated .txt)', () => {
  const H = ['amazon-order-id', 'merchant-order-id', 'purchase-date', 'last-updated-date', 'order-status', 'fulfillment-channel', 'sales-channel', 'order-channel', 'url', 'ship-service-level', 'product-name', 'sku', 'asin', 'item-status', 'quantity', 'currency', 'item-price', 'item-tax', 'shipping-price', 'shipping-tax', 'gift-wrap-price', 'gift-wrap-tax', 'item-promotion-discount', 'ship-promotion-discount', 'ship-city', 'ship-state', 'ship-postal-code', 'ship-country', 'promotion-ids'].join('\t');
  const L = (id: string, date: string, status: string, name: string, qty: string, price: string, country: string) => [id, '', date, date, status, 'Amazon', 'Amazon.com', '', '', 'Standard', name, 'SKU-' + id.slice(-1), 'B0' + id.slice(-3), status, qty, 'USD', price, '0.80', '0', '0', '', '', '0', '0', 'Seattle', 'WA', '98101', country, ''].join('\t');
  const tsv = [H, L('111-0000001-0000001', '2026-10-01T14:22:31+00:00', 'Shipped', 'Yoga Mat, Purple', '1', '29.99', 'US'), L('111-0000002-0000002', '2026-10-02T09:00:00+00:00', 'Cancelled', 'Yoga Block', '2', '', 'US'), L('111-0000003-0000003', '2026-10-05T18:30:00-07:00', 'Shipped', 'Yoga Block', '2', '19.98', 'US')].join('\n');
  const { dataset, report } = run(tsv, 'All Orders.txt');
  it('detects tabs, the Amazon layout and drops the cancelled order', () => {
    expect(report.files[0].delimiter).toBe('\t');
    expect(report.platform).toBe('amazon');
    expect(sales(dataset.rows)).toBe(49.97);
    expect(dataset.rows.find((r) => r.Product === 'Yoga Block')!.OrderDate).toBe('2026-10-05'); // the day as written, not shifted to UTC
    expect(issue(report, 'cancelled')!.count).toBe(1);
  });
});

describe('WooCommerce orders (several products in one cell)', () => {
  const csv = ['Date,Order #,Status,Customer,Customer type,Product(s),Items sold,Coupon(s),Net Sales,Attribution',
    '2026-10-01,5001,Completed,Mia Chen,new,"2× Hoodie, 1× Cap",3,,90.00,Direct',
    '2026-10-02,5002,Refunded,Tom Ray,returning,1× Hoodie,1,,35.00,Direct',
    '2026-10-03,5003,Cancelled,Eve Park,new,1× Cap,1,,20.00,Direct',
  ].join('\n');
  const { dataset, report } = run(csv);
  it('splits "2× Hoodie, 1× Cap" into products and handles refunded and cancelled orders', () => {
    expect(report.platform).toBe('woocommerce');
    const o = dataset.rows.filter((r) => r.Order === '5001');
    expect(o.map((r) => [r.Product, r.Quantity, r.Sales])).toEqual([['Hoodie', 2, 60], ['Cap', 1, 30]]);
    expect(sales(dataset.rows)).toBe(125);
    expect(returns(dataset.rows)).toBe(-35);
    expect(dataset.rows.some((r) => r.Order === '5003')).toBe(false);
  });
});

describe('Stripe payments', () => {
  const csv = ['id,Created date (UTC),Amount,Amount Refunded,Currency,Captured,Converted Amount,Converted Amount Refunded,Converted Currency,Decline Reason,Description,Fee,Refunded date (UTC),Statement Descriptor,Status,Seller Message,Taxes On Fee,Card ID,Customer ID,Customer Description,Customer Email',
    'ch_1,2026-10-01 12:00:00,25.00,0.00,usd,true,25.00,0.00,usd,,Pro plan,1.03,,ACME,Paid,Payment complete.,0,card_1,cus_1,,a@x.com',
    'ch_2,2026-10-02 12:00:00,25.00,25.00,usd,true,25.00,25.00,usd,,Pro plan,1.03,2026-10-03 12:00:00,ACME,Refunded,Payment complete.,0,card_2,cus_2,,b@x.com',
    'ch_3,2026-10-03 12:00:00,25.00,0.00,usd,false,0,0,usd,card_declined,Pro plan,0,,ACME,Failed,Declined,0,card_3,cus_3,,c@x.com',
  ].join('\n');
  const { dataset, report } = run(csv);
  it('skips failed payments, books refunds, reads lowercase currency', () => {
    expect(report.platform).toBe('stripe');
    expect(report.currency).toBe('USD');
    expect(sales(dataset.rows)).toBe(50);
    expect(returns(dataset.rows)).toBe(-25);
  });
});

describe('Tableau crosstab (one column per month, UTF-16 text)', () => {
  const tsv = '﻿' + ['Product\tJanuary 2026\tFebruary 2026\tMarch 2026\tGrand Total', 'Mug\t100\t120\t90\t310', 'Bowl\t50\t\t70\t120', 'Grand Total\t150\t120\t160\t430'].join('\r\n');
  const { dataset, report } = run(tsv, 'Sales by month.csv');
  it('turns month columns into rows, ignoring grand totals', () => {
    expect(report.files[0].how).toMatch(/one column per month/);
    expect(sales(dataset.rows)).toBe(430);
    expect(dataset.rows.filter((r) => r.Product === 'Bowl')).toHaveLength(2);
    expect(report.roles.date).toBe('Month');
  });
});

describe('generic US spreadsheet', () => {
  const csv = ['Date,Product,Customer,Amount,Notes', '3/14/2026,Candle,Ana,"$1,234.50",', '3/15/2026,Candle,Raj,$20.00,gift', '3/20/2026,Soap,Ana,($20.00),refund'].join('\n');
  const { dataset, report } = run(csv);
  it('reads quoted thousands, parentheses refunds and month-first dates', () => {
    expect(report.dateOrder).toBe('mdy');
    expect(sales(dataset.rows)).toBe(1254.5);
    expect(returns(dataset.rows)).toBe(-20);
    expect(report.unlocks.find((u) => u.key === 'profit')!.ok).toBe(false);
  });
});

describe('missing information', () => {
  const csv = ['Order ID,Order Date,Product,Customer,Qty,Unit Price',
    'A1,2026-01-05,Mug,Ana,1,10', 'A2,2026-01-06,Mug,,2,10', 'A3,,Bowl,Raj,1,15', 'A4,2026-01-08,Bowl,Raj,1,', 'A5,2026-01-09,,Lee,1,12', 'A6,yesterday,Mug,Ana,1,10', 'A7,2026-01-10,Mug,Ana,two,10'].join('\n');
  const { dataset, report } = run(csv);
  it('names every problem with its line numbers and what was done', () => {
    expect(issue(report, 'no-date')).toMatchObject({ count: 1, lines: [4], severity: 'dropped' });
    expect(issue(report, 'bad-date')).toMatchObject({ count: 1, lines: [7], severity: 'dropped' });
    expect(issue(report, 'no-money')).toMatchObject({ count: 1, lines: [5], severity: 'dropped' });
    expect(issue(report, 'no-customer')).toMatchObject({ count: 1, lines: [3], severity: 'kept' });
    expect(issue(report, 'no-product')).toMatchObject({ count: 1, lines: [6], severity: 'kept' });
    expect(issue(report, 'bad-qty')).toMatchObject({ count: 1, lines: [8], severity: 'kept' });
    expect(dataset.rows).toHaveLength(4);
    expect(sales(dataset.rows)).toBe(10 + 20 + 12 + 10);
    expect(report.issues[0].severity).toBe('dropped');
  });
  it('works with no date at all, and says trends are locked', () => {
    const r = run('Product,Sales,Profit,Region\nA,100,10,East\nB,200,20,West');
    expect(sales(r.dataset.rows)).toBe(300);
    expect(r.dataset.rows[0].Profit).toBe(10);
    expect(r.report.unlocks.find((u) => u.key === 'trends')!.ok).toBe(false);
  });
  it('explains clearly when there is no money column', () => {
    expect(() => run('Date,Product,Customer\n2026-01-01,Mug,Ana\n2026-01-02,Bowl,Raj')).toThrow(IngestError);
    try { run('Date,Product,Customer\n2026-01-01,Mug,Ana\n2026-01-02,Bowl,Raj'); } catch (e: any) { expect(e.code).toBe('NO_MONEY'); expect(e.report.columns).toEqual(['Date', 'Product', 'Customer']); }
  });
  it('lets the person fix a column the reader got wrong', () => {
    const csv2 = 'When,What,Who,Value,Tip\n2026-01-01,Mug,Ana,10,1\n2026-01-02,Bowl,Raj,15,2';
    const r = run(csv2, 'x.csv', { overrides: { amount: 'Tip' } });
    expect(sales(r.dataset.rows)).toBe(3);
    expect(r.report.roles.amount).toBe('Tip');
  });
  it('honours a day-first override for ambiguous dates', () => {
    const csv3 = 'Date,Item,Total\n01/02/2026,Mug,10\n03/04/2026,Bowl,15';
    expect(run(csv3).report.dateOrderAssumed).toBe(true);
    expect(run(csv3, 'x', { dateOrder: 'dmy' }).dataset.rows[0].OrderDate).toBe('2026-02-01');
  });
  it('reads Excel date serial numbers', () => {
    const r = run('Date,Item,Total\n46096,Mug,10\n46097,Bowl,15');
    expect(r.dataset.rows[0].OrderDate).toBe('2026-03-15');
  });
});

describe('row limit', () => {
  it('says so when a file is cut short', () => {
    const csv = 'Date,Item,Total\n' + Array.from({ length: 30 }, (_, i) => `2026-01-${String(1 + (i % 28)).padStart(2, '0')},Mug,10`).join('\n');
    const { dataset, report } = run(csv, 'x', { maxRows: 20 });
    expect(dataset.rows).toHaveLength(20);
    expect(issue(report, 'trimmed')).toMatchObject({ count: 10, severity: 'dropped' });
  });
});

describe('product name fallback', () => {
  it('uses the SKU when a product name is blank', () => {
    const { dataset, report } = run('Order,Date,SKU,Product,Price\n1,2026-01-01,M1,Mug,10\n2,2026-01-02,S1,,12');
    expect(dataset.rows[1].Product).toBe('SKU S1');
    expect(issue(report, 'sku-as-product')!.lines).toEqual([3]);
  });
});

describe('adding a second file', () => {
  const salesCsv = 'Order,Date,SKU,Product,Qty,Price\n1,2026-01-01,M1,Mug,2,10\n2,2026-01-02,B1,Bowl,1,30\n3,2026-01-03,M1,Mug,1,10';
  it('fills in product costs by SKU and unlocks profit', () => {
    const costs = 'SKU,Cost per item\nM1,4\nB1,12';
    const { dataset, report } = ingest([{ name: 'sales.csv', text: salesCsv }, { name: 'costs.csv', text: costs }]);
    expect(report.files[1].how).toMatch(/Matched by sku/i);
    expect(report.unlocks.find((u) => u.key === 'profit')!.ok).toBe(true);
    const profit = Math.round(dataset.rows.reduce((s, r) => s + (r.Profit as number), 0) * 100) / 100;
    expect(sales(dataset.rows)).toBe(60);
    expect(profit).toBe(60 - (2 * 4 + 12 + 4));
  });
  it('fills in missing customers by order number', () => {
    const custs = 'Order,Customer email,Country\n1,a@x.com,UK\n2,b@x.com,France\n3,a@x.com,UK';
    const { dataset, report } = ingest([{ name: 'sales.csv', text: salesCsv }, { name: 'customers.csv', text: custs }]);
    expect(report.unlocks.find((u) => u.key === 'customers')!.ok).toBe(true);
    expect(dataset.rows.map((r) => r.Customer)).toEqual(['a@x.com', 'b@x.com', 'a@x.com']);
  });
  it('stacks two exports with the same columns', () => {
    const more = 'Order,Date,SKU,Product,Qty,Price\n4,2026-02-01,M1,Mug,1,10';
    const { dataset } = ingest([{ name: 'jan.csv', text: salesCsv }, { name: 'feb.csv', text: more }]);
    expect(sales(dataset.rows)).toBe(70);
  });
});

describe('text from a PDF report', () => {
  const pdfText = ['Sunny Shop — Sales Report', 'Page 1 of 2', 'Invoice\tDate\tItem\tQty\tAmount', 'INV-01\tMar 1, 2026\tCandle\t2\t$24.00', 'INV-02\tMar 2, 2026\tSoap Bar\t3\t$15.00', 'Page 2 of 2', 'Invoice\tDate\tItem\tQty\tAmount', 'INV-03\tMar 9, 2026\tCandle\t1\t$12.00', 'Total\t\t\t\t$51.00'].join('\n');
  const { dataset, report } = run(pdfText, 'report.pdf');
  it('skips page labels, repeated headers and the total line', () => {
    expect(dataset.rows).toHaveLength(3);
    expect(sales(dataset.rows)).toBe(51);
    expect(dataset.rows[2].OrderDate).toBe('2026-03-09');
  });
});

describe('real UK shop sample matches the proven reader exactly', () => {
  const text = readFileSync(new URL('../apps/web/public/samples/real-shop-sales-sample.csv', import.meta.url), 'utf8');
  const fresh = ingest([{ name: 'uk.csv', text }]).dataset, old = parseCsvLegacy(text, 'uk.csv');
  it('same rows, sales, returns and cleaning counts', () => {
    expect(fresh.rows.length).toBe(old.rows.length);
    expect(sales(fresh.rows)).toBe(sales(old.rows));
    expect(returns(fresh.rows)).toBe(returns(old.rows));
    expect(fresh.prep).toEqual(old.prep);
    expect(new Set(fresh.rows.map((r) => r.Customer)).size).toBe(new Set(old.rows.map((r) => r.Customer)).size);
  });
});

describe('round 2: traps that silently give wrong numbers', () => {
  it('order total repeated on every line is not double-counted (uses price × qty)', () => {
    const csv = 'Order ID,Date,Product,Qty,Unit Price,Order Total\n1,2026-01-01,Mug,2,10,50\n1,2026-01-01,Bowl,1,30,50\n2,2026-01-02,Mug,1,10,10\n3,2026-01-03,Bowl,1,30,40\n3,2026-01-03,Spoon,2,5,40';
    const { dataset, report } = run(csv);
    expect(sales(dataset.rows)).toBe(50 + 10 + 40);
    expect(issue(report, 'order-total')).toBeTruthy();
  });
  it('order total only on the first line, no unit price: split across lines, order totals exact', () => {
    const csv = 'Order,Date,Item,Total\nA,2026-01-01,Mug,60\nA,,Bowl,\nB,2026-01-02,Mug,10\nC,2026-01-03,Bowl,40\nC,,Spoon,';
    const { dataset } = run(csv);
    expect(sales(dataset.rows)).toBe(110);
    expect(dataset.rows.filter((r) => r.Order === 'A').map((r) => r.Sales)).toEqual([30, 30]);
  });
  it('a "Discount %" column is never treated as money', () => {
    const csv = 'Date,Product,Price,Qty,Discount %\n2026-01-01,Mug,10,1,10%\n2026-01-02,Bowl,20,1,0%';
    const { dataset, report } = run(csv);
    expect(report.roles.discount).toBeUndefined();
    expect(sales(dataset.rows)).toBe(30);
  });
  it('reads the currency from the header when amounts have no symbol', () => {
    expect(run('Date,Product,Total (CAD)\n2026-01-01,Mug,10\n2026-01-02,Bowl,20').report.currency).toBe('CAD');
  });
  it('reads monthly summaries ("Oct 2026", "2026-11")', () => {
    const { dataset } = run('Month,Revenue\nOct 2026,1000\nNov 2026,1200\nDec 2026,900');
    expect(dataset.rows.map((r) => r.OrderDate)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
    expect(run('Period,Sales\n2026-10,5\n2026-11,6').dataset.rows[1].OrderDate).toBe('2026-11-01');
  });
  it('handles Excel artifacts: 1.5E+3 amounts and 1001.0 ids', () => {
    const { dataset } = run('Order,Date,Customer,Item,Amount\n1001.0,2026-01-01,15719.0,Mug,1.5E+3\n1002.0,2026-01-02,15719.0,Bowl,20');
    expect(dataset.rows[0]).toMatchObject({ Order: '1001', Customer: '15719', Sales: 1500 });
  });
  it('reads "1.234" as one thousand two hundred thirty-four in a European file', () => {
    const { dataset } = run('Datum;Artikel;Betrag\n01.02.2026;Lampe;1.234\n02.02.2026;Stuhl;56');
    expect(sales(dataset.rows)).toBe(1290);
  });
  it('fills in a blank order number on an order\'s extra lines', () => {
    const csv = 'Order,Date,Customer,Product,Qty,Price\n#1,2026-01-01,Ana,Mug,1,10\n,,,Bowl,2,15\n#2,2026-01-02,Raj,Mug,1,10';
    const { dataset } = run(csv);
    expect(dataset.rows.filter((r) => r.Order === '#1')).toHaveLength(2);
    expect(dataset.rows.find((r) => r.Product === 'Bowl')).toMatchObject({ Customer: 'Ana', OrderDate: '2026-01-01', Sales: 30 });
  });
  it('reports duplicates, zero-value lines and shipping lines instead of hiding them', () => {
    const csv = 'Order,Date,Product,Qty,Price\n1,2026-01-01,Mug,1,10\n1,2026-01-01,Mug,1,10\n2,2026-01-02,Free Sticker,1,0\n2,2026-01-02,Shipping,1,4.99\n3,2026-01-03,Shipping Box (decor),1,12';
    const { dataset, report } = run(csv);
    expect(issue(report, 'duplicates')!.count).toBe(1);
    expect(issue(report, 'zero-value')!.count).toBe(1);
    expect(issue(report, 'fees')!.count).toBe(1);
    expect(sales(dataset.rows)).toBe(22); // the "Shipping Box (decor)" product is a real product
  });
  it('treats a Type column of Sale/Return correctly', () => {
    const { dataset } = run('Date,Product,Type,Amount\n2026-01-01,Mug,Sale,10\n2026-01-05,Mug,Return,10');
    expect(sales(dataset.rows)).toBe(10);
    expect(returns(dataset.rows)).toBe(-10);
  });
  it('ignores a spreadsheet index column', () => {
    const { report } = run(',Date,Product,Amount\n0,2026-01-01,Mug,10.5\n1,2026-01-02,Bowl,20.25\n2,2026-01-03,Mug,10.5');
    expect(report.roles.amount).toBe('Amount');
    expect(report.roles.order).toBeUndefined();
  });
  it('keeps a mixed-currency warning', () => {
    const { report } = run('Date,Product,Amount,Currency\n2026-01-01,Mug,10,USD\n2026-01-02,Bowl,20,EUR\n2026-01-03,Mug,10,USD');
    expect(report.currency).toBe('USD');
    expect(issue(report, 'mixed-currency')).toBeTruthy();
  });
});
