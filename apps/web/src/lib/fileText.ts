/**
 * Turns any file a store owner might have into text the server's universal reader understands.
 * CSV/TSV/TXT: decoded with the right text encoding. Excel/Numbers/ODS: the sheet with the sales.
 * PDF: the table rebuilt from the positions of the words on each page.
 */
export interface FileText { name: string; text: string; kind: 'csv' | 'excel' | 'pdf'; note?: string }
export class FileReadError extends Error {}

const SPREADSHEET = /\.(xlsx|xlsm|xls|ods|numbers)$/i;
const TEXT = /\.(csv|tsv|txt|tab)$/i;

export async function fileToText(f: File): Promise<FileText> {
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') return { name: f.name, kind: 'pdf', ...(await pdfToText(f)) };
  if (SPREADSHEET.test(f.name)) return { name: f.name, kind: 'excel', ...(await sheetToText(f)) };
  if (TEXT.test(f.name) || f.type.startsWith('text/')) return { name: f.name, kind: 'csv', text: decode(new Uint8Array(await f.arrayBuffer())) };
  if (/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(f.name)) throw new FileReadError('That\'s a picture. Blindspot needs the sales data itself: download a CSV, Excel or PDF report from your store instead.');
  if (/\.(docx?|pages|pptx?|key|zip|rar)$/i.test(f.name)) throw new FileReadError('That file type can\'t hold a sales table Blindspot can read. Use a CSV, Excel, Numbers, Google Sheets or PDF export.');
  // Unknown extension: try it as text.
  const text = decode(new Uint8Array(await f.arrayBuffer()));
  if (!/[,;\t|]/.test(text.slice(0, 2000))) throw new FileReadError('This doesn\'t look like a sales table. Use a CSV, Excel, Numbers, Google Sheets or PDF export.');
  return { name: f.name, kind: 'csv', text };
}

/** UTF-8 (with or without BOM), UTF-16 (Tableau and Excel "Unicode text"), or Windows-1252 for older exports. */
export function decode(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  // UTF-16 without a BOM: every other byte is zero in the first few hundred bytes.
  const head = b.subarray(0, 400);
  let zerosOdd = 0, zerosEven = 0;
  for (let i = 0; i < head.length; i++) if (head[i] === 0) (i % 2 ? zerosOdd++ : zerosEven++);
  if (zerosOdd > head.length / 4) return new TextDecoder('utf-16le').decode(b);
  if (zerosEven > head.length / 4) return new TextDecoder('utf-16be').decode(b);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
  catch { return new TextDecoder('windows-1252').decode(b); }
}

async function sheetToText(f: File): Promise<{ text: string; note?: string }> {
  const XLSX = await import('xlsx');
  let wb;
  try { wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' }); }
  catch { throw new FileReadError('This spreadsheet couldn\'t be opened. If it\'s password-protected, remove the password or export it as CSV.'); }
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
  return { text, note: wb.SheetNames.length > 1 ? `Read the "${best.name}" sheet (${best.rows.toLocaleString()} rows)${others.length ? `; also has ${others.map((o) => `"${o.name}"`).join(', ')}` : ''}.` : undefined };
}

interface Cell { x0: number; x1: number; text: string }

async function pdfToText(f: File): Promise<{ text: string; note?: string }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; }
  catch (e: any) { throw new FileReadError(/password/i.test(e?.message ?? '') ? 'This PDF is password-protected. Open it, save a copy without the password, and try again.' : 'This PDF couldn\'t be opened.'); }
  const lines: Cell[][] = [];
  let words = 0;
  for (let p = 1; p <= Math.min(doc.numPages, 400); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as any[]).filter((it) => typeof it.str === 'string' && it.str.trim() !== '')
      .map((it) => ({ x: it.transform[4] as number, y: it.transform[5] as number, w: (it.width as number) || it.str.length * 4, h: Math.abs(it.transform[3] as number) || 8, s: it.str as string }));
    words += items.length;
    // Group words into lines by their vertical position.
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const pageLines: (typeof items)[] = [];
    for (const it of items) {
      const line = pageLines.find((l) => Math.abs(l[0].y - it.y) <= Math.max(2, it.h * 0.45));
      if (line) line.push(it); else pageLines.push([it]);
    }
    for (const l of pageLines) {
      l.sort((a, b) => a.x - b.x);
      // Words close together belong to the same cell; a wider gap starts a new cell.
      const cells: Cell[] = [];
      for (const it of l) {
        const last = cells[cells.length - 1];
        const gap = last ? it.x - last.x1 : Infinity;
        if (last && gap < Math.max(3, it.h * 0.9)) { last.text += (gap > it.h * 0.15 ? ' ' : '') + it.s; last.x1 = it.x + it.w; }
        else cells.push({ x0: it.x, x1: it.x + it.w, text: it.s });
      }
      lines.push(cells.map((c) => ({ ...c, text: c.text.trim() })));
    }
  }
  if (!words) throw new FileReadError('This PDF is a scanned picture with no text in it, so the numbers can\'t be read. Download the report from your store as CSV or Excel instead.');
  // Columns come from the header line (the first wide line made mostly of words); every cell joins the nearest column.
  const isNum = (s: string) => /^[-(]?[$£€¥₹]?\s?[\d.,]+\)?%?$/.test(s.replace(/\s/g, ''));
  const header = lines.find((l) => l.length >= 3 && l.filter((c) => !isNum(c.text)).length / l.length >= 0.75 && l.filter((c) => !/\d{2}/.test(c.text)).length >= 2);
  let text: string;
  if (header) {
    const cols = header.map((c) => ({ x0: c.x0, x1: c.x1, mid: (c.x0 + c.x1) / 2 }));
    const out = lines.map((l) => {
      if (l.length === 1 && l !== header) return l[0].text;
      const row: string[] = cols.map(() => '');
      for (const c of l) {
        const mid = (c.x0 + c.x1) / 2;
        // overlap first (text sits under its header), then nearest centre
        let best = cols.findIndex((k) => c.x0 < k.x1 + 2 && c.x1 > k.x0 - 2);
        if (best < 0) best = cols.reduce((bi, k, i) => (Math.abs(k.mid - mid) < Math.abs(cols[bi].mid - mid) ? i : bi), 0);
        row[best] = row[best] ? `${row[best]} ${c.text}` : c.text;
      }
      return row.map((v) => v.replace(/\t/g, ' ')).join('\t');
    });
    text = out.join('\n');
  } else text = lines.map((l) => l.map((c) => c.text.replace(/\t/g, ' ')).join('\t')).join('\n');
  return { text, note: `Read from a ${doc.numPages}-page PDF. Check the columns below: PDFs don't store tables, so Blindspot rebuilt it from the layout.` };
}
