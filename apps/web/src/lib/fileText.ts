/**
 * Turns any file a store owner might have into text the server's universal reader understands.
 * CSV/TSV/TXT: decoded with the right text encoding. Excel/Numbers/ODS: the sheet with the sales.
 * PDF: the table rebuilt from the positions of the words on each page.
 */
import { pdfItemsToText, type PdfItem } from './pdfLayout';

export interface FileText {
  name: string;
  text: string;
  kind: 'csv' | 'excel' | 'pdf';
  note?: string;
}
export class FileReadError extends Error {}

const SPREADSHEET = /\.(xlsx|xlsm|xls|ods|numbers)$/i;
const TEXT = /\.(csv|tsv|txt|tab)$/i;

export async function fileToText(f: File): Promise<FileText> {
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    return { name: f.name, kind: 'pdf', ...(await pdfToText(f)) };
  if (SPREADSHEET.test(f.name)) return { name: f.name, kind: 'excel', ...(await sheetToText(f)) };
  if (TEXT.test(f.name) || f.type.startsWith('text/'))
    return { name: f.name, kind: 'csv', text: decode(new Uint8Array(await f.arrayBuffer())) };
  if (/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(f.name))
    throw new FileReadError(
      "That's a picture. Blindspot needs the sales data itself: download a CSV, Excel or PDF report from your store instead.",
    );
  if (/\.(docx?|pages|pptx?|key|zip|rar)$/i.test(f.name))
    throw new FileReadError(
      "That file type can't hold a sales table Blindspot can read. Use a CSV, Excel, Numbers, Google Sheets or PDF export.",
    );
  // Unknown extension: try it as text.
  const text = decode(new Uint8Array(await f.arrayBuffer()));
  if (!/[,;\t|]/.test(text.slice(0, 2000)))
    throw new FileReadError(
      "This doesn't look like a sales table. Use a CSV, Excel, Numbers, Google Sheets or PDF export.",
    );
  return { name: f.name, kind: 'csv', text };
}

/** UTF-8 (with or without BOM), UTF-16 (Tableau and Excel "Unicode text"), or Windows-1252 for older exports. */
export function decode(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  // UTF-16 without a BOM: every other byte is zero in the first few hundred bytes.
  const head = b.subarray(0, 400);
  let zerosOdd = 0,
    zerosEven = 0;
  for (let i = 0; i < head.length; i++) if (head[i] === 0) i % 2 ? zerosOdd++ : zerosEven++;
  if (zerosOdd > head.length / 4) return new TextDecoder('utf-16le').decode(b);
  if (zerosEven > head.length / 4) return new TextDecoder('utf-16be').decode(b);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

async function sheetToText(f: File): Promise<{ text: string; note?: string }> {
  const XLSX = await import('xlsx');
  let wb;
  try {
    wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
  } catch {
    throw new FileReadError(
      "This spreadsheet couldn't be opened. If it's password-protected, remove the password or export it as CSV.",
    );
  }
  // The sales are usually on the sheet with the most filled rows that contains numbers.
  const scored = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: true });
    const numeric = rows.slice(0, 200).reduce((s, r) => s + r.filter((c) => typeof c === 'number').length, 0);
    return { name, rows: rows.length, score: rows.length * (numeric > 0 ? 1 : 0.1) };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || !best.rows) throw new FileReadError('This spreadsheet is empty.');
  const ws = wb.Sheets[best.name];
  const text = XLSX.utils.sheet_to_csv(ws, { blankrows: false, dateNF: 'yyyy-mm-dd', strip: true });
  const others = scored.slice(1).filter((s) => s.rows > 1);
  return {
    text,
    note:
      wb.SheetNames.length > 1
        ? `Read the "${best.name}" sheet (${best.rows.toLocaleString()} rows)${others.length ? `; also has ${others.map((o) => `"${o.name}"`).join(', ')}` : ''}.`
        : undefined,
  };
}

async function pdfToText(f: File): Promise<{ text: string; note?: string }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  } catch (e: any) {
    throw new FileReadError(
      /password/i.test(e?.message ?? '')
        ? 'This PDF is password-protected. Open it, save a copy without the password, and try again.'
        : "This PDF couldn't be opened.",
    );
  }
  const items: PdfItem[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 500); p++) {
    for (const it of (await (await doc.getPage(p)).getTextContent()).items as any[]) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      const h = Math.abs(it.transform[3] as number) || 8;
      items.push({
        x: it.transform[4],
        y: it.transform[5],
        w: (it.width as number) || it.str.length * h * 0.5,
        h,
        s: it.str,
        page: p,
      });
    }
  }
  if (!items.length)
    throw new FileReadError(
      "This PDF is a scanned picture with no text in it, so the numbers can't be read. Download the report from your store as CSV or Excel instead.",
    );
  const { text, rows, headerFound } = pdfItemsToText(items);
  return {
    text,
    note: headerFound
      ? `Read from a ${doc.numPages}-page PDF: ${rows.toLocaleString()} table rows rebuilt from the page layout.`
      : `Read from a ${doc.numPages}-page PDF without a clear table header; check the columns below.`,
  };
}
