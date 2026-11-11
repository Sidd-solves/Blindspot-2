/**
 * Rebuilds a table from the positions of words on PDF pages (PDFs store words, not tables).
 * Pure function so it can be tested in Node against real PDFs.
 *
 *  words → printed lines (same height) → table rows (lines closer together than the gap between rows are
 *  one row whose cells wrapped) → header row (also allowed to wrap) → columns (edges halfway between
 *  headings, so right-aligned numbers land correctly) → one tab-separated line per row
 */
export interface PdfItem { x: number; y: number; w: number; h: number; s: string; page: number }
interface Line { y: number; page: number; h: number; items: PdfItem[] }

const isNum = (s: string) => /^[-(−]?[$£€¥₹]?\s?[\d.,]+\)?%?$/.test(s.replace(/\s/g, ''));

function groupLines(items: PdfItem[]): Line[] {
  const sorted = items.filter((i) => i.s.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const l = lines[lines.length - 1];
    if (l && l.page === it.page && Math.abs(l.y - it.y) <= Math.max(1.5, it.h * 0.3)) { l.items.push(it); l.h = Math.max(l.h, it.h); }
    else lines.push({ y: it.y, page: it.page, h: it.h, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** Per page: the vertical gap that separates rows from wrapped lines inside a row (0 = nothing wraps). */
function rowGap(lines: Line[]): number {
  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > 0.5).map((g) => Math.round(g * 2) / 2);
  const u = [...new Set(gaps)].sort((a, b) => a - b);
  let best = 0, ratio = 1;
  for (let i = 0; i + 1 < u.length; i++) { const r = u[i + 1] / u[i]; if (r > ratio && u[i + 1] - u[i] >= 3) { ratio = r; best = (u[i] + u[i + 1]) / 2; } }
  return ratio >= 1.6 ? best : 0;
}

/** Group a row's words into cells: words stacked on top of each other (wrapped) or close on one line belong together. */
function cellsByLayout(items: PdfItem[]) {
  const cells: { x0: number; x1: number; parts: PdfItem[] }[] = [];
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const x0 = it.x, x1 = it.x + it.w;
    const c = cells.find((k) => (x0 < k.x1 - 1 && x1 > k.x0 + 1) || (x0 - k.x1 >= -1 && x0 - k.x1 < Math.max(2.5, it.h * 0.45) && k.parts.some((p) => Math.abs(p.y - it.y) < it.h * 0.3)));
    if (c) { c.parts.push(it); c.x0 = Math.min(c.x0, x0); c.x1 = Math.max(c.x1, x1); } else cells.push({ x0, x1, parts: [it] });
  }
  return cells.map((c) => ({ x0: c.x0, x1: c.x1, text: joinParts(c.parts) }));
}

/** Text of one cell, top line first; a line ending in "-" or "/" continues without a space. */
function joinParts(parts: PdfItem[]) {
  const lines: PdfItem[][] = [];
  for (const p of [...parts].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const l = lines[lines.length - 1];
    if (l && Math.abs(l[0].y - p.y) < p.h * 0.3) l.push(p); else lines.push([p]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join(' ')).reduce((acc, t) => (acc ? (/[-/]$/.test(acc) ? acc + t : `${acc} ${t}`) : t), '').replace(/\s+/g, ' ').trim();
}

export function pdfItemsToText(items: PdfItem[]): { text: string; rows: number; headerFound: boolean } {
  const lines = groupLines(items);
  // Rows: consecutive lines closer than the page's row gap belong to one row.
  const rows: { page: number; items: PdfItem[] }[] = [];
  const pages = [...new Set(lines.map((l) => l.page))];
  for (const pg of pages) {
    const pl = lines.filter((l) => l.page === pg), gap = rowGap(pl);
    pl.forEach((l, i) => {
      if (i > 0 && gap && pl[i - 1].y - l.y <= gap) rows[rows.length - 1].items.push(...l.items);
      else rows.push({ page: pg, items: [...l.items] });
    });
  }
  // Header: the first row made mostly of words with 3+ cells.
  const hi = rows.findIndex((r) => { const c = cellsByLayout(r.items); return c.length >= 3 && c.filter((k) => !isNum(k.text) && !/\d{2}/.test(k.text)).length / c.length >= 0.75; });
  if (hi < 0) return { text: rows.map((r) => cellsByLayout(r.items).map((c) => c.text).join('\t')).join('\n'), rows: rows.length, headerFound: false };
  const head = cellsByLayout(rows[hi].items);
  const edges = head.slice(0, -1).map((c, k) => (c.x1 + head[k + 1].x0) / 2);
  const colOf = (it: PdfItem) => { const mid = it.x + it.w / 2; let k = 0; while (k < edges.length && mid > edges[k]) k++; return k; };
  const out: string[] = rows.slice(0, hi).map((r) => cellsByLayout(r.items).map((c) => c.text).join(' '));
  out.push(head.map((c) => c.text).join('\t'));
  let n = 0;
  for (const r of rows.slice(hi + 1)) {
    const cols: PdfItem[][] = head.map(() => []);
    for (const it of r.items) cols[colOf(it)].push(it);
    const cells = cols.map((p) => (p.length ? joinParts(p) : ''));
    if (cells.filter(Boolean).length === 1) { out.push(cells.find(Boolean)!); continue; } // page labels, notes
    out.push(cells.map((c) => c.replace(/\t/g, ' ')).join('\t')); n++;
  }
  return { text: out.join('\n'), rows: n, headerFound: true };
}
