import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfItemsToText, type PdfItem } from '../apps/web/src/lib/pdfLayout';
import { ingest } from '@blindspot/analytics';

/** Real PDFs (printed from HTML tables by Chrome) through the same layout code the browser uses. */
async function read(file: string) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(new URL(`./fixtures/${file}`, import.meta.url))),
  }).promise;
  const items: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++)
    for (const it of (await (await doc.getPage(p)).getTextContent()).items as any[])
      if (it.str?.trim())
        items.push({
          x: it.transform[4],
          y: it.transform[5],
          w: it.width,
          h: Math.abs(it.transform[3]),
          s: it.str,
          page: p,
        });
  return ingest([{ name: file, text: pdfItemsToText(items).text }]);
}
const sales = (rows: any[]) =>
  Math.round(rows.filter((r) => r.IsReturn !== 1).reduce((s, r) => s + r.Sales, 0) * 100) / 100;

describe('PDF tables', () => {
  it('reads a simple 2-page report, skipping titles, repeated headers and the total', async () => {
    const { dataset, report } = await read('simple_report.pdf');
    expect(dataset.rows).toHaveLength(70);
    expect(sales(dataset.rows)).toBe(2922.16);
    expect(report.files[0].format).toBe('PDF report');
    expect(dataset.rows.some((r) => r.Product === 'Candle, Vanilla')).toBe(true);
  }, 30000);
  it('rebuilds rows whose cells wrap onto two lines (and a wrapped header)', async () => {
    const { dataset, report } = await read('wrapped_cells_report.pdf');
    expect(report.rowsUsed).toBe(150);
    expect(sales(dataset.rows)).toBe(5879.63);
    expect(report.roles).toMatchObject({
      order: 'Invoice',
      date: 'Date',
      price: 'Unit Price',
      amount: 'Amount',
      country: 'Country',
    });
    expect(dataset.rows[0]).toMatchObject({
      Order: 'INV-10001',
      OrderDate: '2024-07-01',
      Customer: 'Emma Nguyen',
    });
    expect(dataset.rows.some((r) => r.Country === 'United States')).toBe(true);
  }, 30000);
});
