import { describe, it, expect } from 'vitest';
import { ingest } from '@blindspot/analytics';

/** Files in unusual shapes: vague or missing headers, other languages and scripts, odd numbers, stacked tables. */
const big = (n: number) => { const P = ['Mug', 'Bowl', 'Spoon', 'Plate']; const out: string[] = []; for (let i = 0; i < n; i++) out.push(`2026-0${1 + (i % 9)}-1${i % 9},${P[i % 4]},user${i}@mail.com,${1 + (i % 3)},${[10.5, 24, 3.25, 8][i % 4]}`); return out; };
const sumTrue = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += (1 + (i % 3)) * [10.5, 24, 3.25, 8][i % 4]; return Math.round(s * 100) / 100; };

const CASES: [string, string, number][] = [
  ['vague headers', 'When,What,Who,Value\n2026-01-03,Mug,Ana,10.50\n2026-01-04,Bowl,Raj,24.00\n2026-01-09,Mug,Lee,10.50\n2026-02-01,Spoon,Ana,3.25', 48.25],
  ['no header row', '2026-01-03,Mug,Ana,2,10.50\n2026-01-04,Bowl,Raj,1,24.00\n2026-01-09,Mug,Lee,1,10.50', 55.5],
  ['spanish', 'Fecha,Producto,Cliente,Cantidad,Precio Unitario,Total\n03/01/2026,Taza,Ana,2,5,10\n15/01/2026,Plato,Luis,1,8,8', 18],
  ['french', 'Date de commande;Désignation;Client;Qté;Prix unitaire;Montant TTC\n03/01/2026;Tasse;Marie;2;5,00;10,00\n15/01/2026;Assiette;Paul;1;8,00;8,00', 18],
  ['portuguese', 'Data,Produto,Cliente,Quantidade,Valor\n03/01/2026,Caneca,Ana,2,10.00\n15/01/2026,Prato,João,1,8.00', 18],
  ['japanese', '日付,商品名,顧客,数量,金額\n2026/01/03,マグ,田中,2,1000\n2026/01/15,皿,佐藤,1,800', 1800],
  ['chinese', '日期,产品,客户,数量,单价,金额\n2026-01-03,杯子,王,2,50,100\n2026-01-15,盘子,李,1,80,80', 180],
  ['junk columns odd order', 'Phone,Zip,Total Paid,Ship Addr,Item Desc,Placed On,Buyer Email,Internal ID,Units\n555-1234,78701,21.00,1 Main,Candle,2026-03-01,a@x.com,99812,3\n555-9999,10001,8.50,2 Oak,Soap,2026-03-02,b@x.com,99813,1', 29.5],
  ['revenue with $ in header', 'Day,SKU,Units Sold,Revenue ($)\n2026-03-01,A1,3,"1,200.00"\n2026-03-02,B2,1,450.00', 1650],
  ['dates with words', 'Sold,Thing,Money\n"Monday, March 2, 2026",Lamp,40\n"Tuesday, March 3, 2026",Chair,60.5', 100.5],
  ['amounts with words', 'Date,Item,Price\n2026-03-01,Lamp,40 USD\n2026-03-02,Chair,EUR 60', 100],
  ['semicolon no symbols', 'datum;omschrijving;klant;aantal;bedrag\n03-01-2026;Mok;Jan;2;10,50\n15-01-2026;Bord;Piet;1;8,25', 18.75],
  ['pipe delimited', 'order_id|order_date|product_name|qty|line_total\n1|2026-01-01|Mug|2|20.00\n2|2026-01-02|Bowl|1|15.00', 35],
  ['customer first/last name', 'Date,First Name,Last Name,Product,Amount\n2026-01-01,Ana,Silva,Mug,10\n2026-01-02,Raj,Patel,Bowl,15', 25],
  ['two-line header', 'Sales export,,,\nDate,Product,Qty,Total\n,,,(USD)\n2026-01-01,Mug,1,10\n2026-01-02,Bowl,1,15', 25],


  ['headerless 40 rows emails', big(40).join('\n'), sumTrue(40)],
  ['korean', '날짜,상품명,고객,수량,금액\n2026-01-03,머그,김,2,20000\n2026-01-15,접시,이,1,8000', 28000],
  ['russian', 'Дата;Товар;Клиент;Количество;Сумма\n03.01.2026;Кружка;Иван;2;500,00\n15.01.2026;Тарелка;Олег;1;300,00', 800],
  ['amounts with currency words', 'Date,Item,Price\n2026-03-01,Lamp,40 dollars\n2026-03-02,Chair,60.50 dollars', 100.5],
  ['qty with units', 'Date,Product,Qty,Unit Price\n2026-03-01,Lamp,2 pcs,40\n2026-03-02,Chair,x3,10', 110],
  ['long preamble', Array.from({ length: 12 }, (_, i) => `Note line ${i}`).join('\n') + '\nDate,Product,Amount\n2026-01-01,Mug,10\n2026-01-02,Bowl,15', 25],
  ['stacked summary table below', 'Date,Product,Amount\n2026-01-01,Mug,10\n2026-01-02,Bowl,15\n\nSummary by product,,\nProduct,Units,Revenue\nMug,1,10\nBowl,1,15', 25],
  ['sparse cells', 'Date,Product,Customer,Amount,Notes\n2026-01-01,Mug,,10,\n2026-01-02,,,15,\n2026-01-03,Bowl,Ana,N/A,\n2026-01-04,Bowl,Ana,—,', 25],
  ['swiss + indian numbers', "Date,Item,Amount\n2026-01-01,A,1'234.50\n2026-01-02,B,\"1,23,456.78\"", 124691.28],
  ['unix timestamps', 'created,product,amount\n1767225600,Mug,10.5\n1767312000,Bowl,15.25', 25.75],
  ['iso Z timestamps', 'timestamp,sku,product,total\n2026-01-05T10:00:00Z,A1,Mug,10\n2026-01-06T23:30:00Z,B1,Bowl,15', 25],
  ['refund column per line', 'Order,Date,Product,Amount,Refund\n1,2026-01-01,Mug,10,0\n2,2026-01-02,Bowl,15,15\n3,2026-01-03,Mug,10,', 35],
  ['all caps headers', 'ORDER DATE,PRODUCT NAME,CUSTOMER NAME,QUANTITY,UNIT PRICE,TOTAL AMOUNT\n01/03/2026,MUG,ANA,2,5,10\n01/15/2026,BOWL,RAJ,1,8,8', 18],
  ['camelCase json-ish export', 'orderId,createdAt,productTitle,customerEmail,quantity,unitPrice\n1,2026-01-01,Mug,a@x.com,2,5\n2,2026-01-02,Bowl,b@x.com,1,8', 18],

  ['PDF page 2 header missing a heading', 'Invoice\tDate\tItem\tQty\tAmount\nINV-1\t2026-03-01\tCandle\t2\t24.00\nInvoice\tDate\tItem\tQty\nINV-2\t2026-03-09\tSoap\t1\t12.00', 36],
];

describe('unusual file shapes', () => {
  it.each(CASES)('%s', (_name, text, want) => {
    const { dataset } = ingest([{ name: 'f', text }]);
    const got = Math.round(dataset.rows.filter((r: any) => r.IsReturn !== 1).reduce((s: number, r: any) => s + r.Sales, 0) * 100) / 100;
    expect(got).toBe(want);
  });
  it('tells you when a second table was skipped', () => {
    const { report } = ingest([{ name: 'f', text: 'Date,Product,Amount\n2026-01-01,Mug,10\n\nProduct,Units,Revenue\nMug,1,10' }]);
    expect(report.issues.find((i) => i.kind === 'second-table')!.lines).toEqual([4]);
  });
});
