import Papa from 'papaparse';
import { nameScore } from './columns';
import { IngestError, ROLES } from './report';
import { monthHeader, norm, parseDate, parseNumber } from './values';

export interface Table {
  headers: string[];
  rows: string[][];
  lines: number[];
  delimiter: string;
  headerLine: number;
  droppedTotals: number[];
  notes: number[];
  how?: string;
  totalLines?: number;
  secondTable?: { line: number; label: string };
}

/** Looks like a data value rather than a column name ("Jan 2026" and "2025" can be either, so they count as names). */
export const isDataCell = (c: string) =>
  (parseNumber(c) !== null && !/^(19|20)\d{2}$/.test(c.trim())) || (parseDate(c) !== null && !monthHeader(c));

export const TOTAL_RE =
  /^(grand\s*|sub\s*|overall\s*)?(totals?|summe|gesamt(summe)?|gesamtbetrag|totale|totaal|somme|suma|sum|total general|total geral|importe total|totalt|yhteensa|razem|celkem)\s*:?\s*$|^total\s+(sales|revenue|amount|for .*)$/i;

export function readTable(text: string, limit?: number): Table {
  const clean = text.replace(/^﻿/, '').replace(/\u0000/g, '');
  const parsed = Papa.parse(clean, {
    delimitersToGuess: [',', ';', '\t', '|'],
    skipEmptyLines: false,
    ...(limit ? { preview: limit + 200 } : {}),
  });
  // Stopped early on a huge file: estimate the full size from its line count, so the person is told.
  let totalLines: number | undefined;
  if (limit && (parsed.data as unknown[]).length >= limit + 200) {
    totalLines = 0;
    for (let i = 0; i < clean.length; i++) if (clean.charCodeAt(i) === 10) totalLines++;
  }
  // Trim in place and keep only indices of non-empty lines: no extra copies of a possibly huge table.
  const all = parsed.data as string[][];
  const delimiter = parsed.meta.delimiter || ',';
  const idx: number[] = [];
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    let any = false;
    for (let j = 0; j < r.length; j++) {
      const c = r[j] == null ? '' : String(r[j]).trim();
      r[j] = c;
      if (c) any = true;
    }
    if (any) idx.push(i);
  }
  const nonEmpty = { length: idx.length, at: (k: number) => ({ r: all[idx[k]], i: idx[k] }) };
  if (!nonEmpty.length) throw new IngestError('EMPTY', 'The file is empty.');
  // Typical width = most common count of filled cells among the first 200 non-empty rows.
  const widths = new Map<number, number>();
  for (let k = 0; k < Math.min(200, nonEmpty.length); k++) {
    const { r } = nonEmpty.at(k);
    const w = r.filter((c) => c !== '').length;
    widths.set(w, (widths.get(w) ?? 0) + 1);
  }
  const typical = [...widths.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  // Header = first row (within the first 40) that is mostly labels and about as wide as the data under it.
  let h = 0;
  for (let k = 0; k < Math.min(40, nonEmpty.length); k++) {
    const cells = nonEmpty.at(k).r.filter((c) => c !== '');
    const labels = cells.filter((c) => !isDataCell(c) && c.length <= 80).length;
    if (cells.length >= Math.max(2, Math.floor(typical * 0.6)) && labels / cells.length >= 0.7) {
      h = k;
      break;
    }
    if (k === Math.min(40, nonEmpty.length) - 1) h = 0;
  }
  // No row looks like column names (the file starts straight with data): name the columns and keep that row as data.
  const firstCells = nonEmpty.at(h).r.filter((c) => c !== '');
  const headerless = firstCells.filter(isDataCell).length / Math.max(1, firstCells.length) >= 0.4;
  const widest = Math.max(
    ...Array.from({ length: Math.min(50, nonEmpty.length) }, (_, k) => nonEmpty.at(k).r.length),
  );
  const synth = Array.from(
    { length: widest },
    (_, j) => `Column ${j < 26 ? String.fromCharCode(65 + j) : j + 1}`,
  );
  const headerRow = headerless ? synth : nonEmpty.at(h).r;
  let width = headerRow.length;
  while (
    width > 1 &&
    headerRow[width - 1] === '' &&
    !Array.from({ length: Math.min(49, nonEmpty.length - h - 1) }, (_, k) => nonEmpty.at(h + 1 + k).r).some(
      (r) => (r[width - 1] ?? '') !== '',
    )
  )
    width--;
  const seen = new Map<string, number>();
  const headers = headerRow.slice(0, width).map((c, i) => {
    let name = c.replace(/\s+/g, ' ').trim() || `Column ${i + 1}`;
    const k = norm(name) || name;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) name = `${name} ${n}`;
    return name;
  });
  const rows: string[][] = [],
    lines: number[] = [],
    droppedTotals: number[] = [],
    notes: number[] = [];
  let secondTable: { line: number; label: string } | undefined;
  const hnorm = headers.map((c) => norm(c)).join('|'),
    hset = new Set(headers.map((c) => norm(c)).filter(Boolean));
  for (let k = headerless ? h : h + 1; k < nonEmpty.length; k++) {
    const { r, i } = nonEmpty.at(k);
    if (r.length !== headers.length) {
      r.length = headers.length;
      for (let j = 0; j < r.length; j++) if (r[j] === undefined) r[j] = '';
    }
    const row = r;
    all[i] = null as any; // the row now lives in `rows`; let the parser's copy go
    if (row.every((c) => c === '')) continue;
    const filled = row.filter((c) => c !== '');
    // Header repeated (page breaks in PDFs, stacked exports), even if a heading or two went missing.
    if (
      filled.length >= 2 &&
      filled.filter((c) => hset.has(norm(c))).length >= Math.max(2, Math.ceil(filled.length * 0.6))
    )
      continue;
    if (filled.length === 1 && headers.length >= 3 && parseNumber(filled[0]) === null) {
      notes.push(i + 1);
      continue;
    } // "Page 2 of 5", notes, section titles
    // A new set of column headings further down = a second table (e.g. a summary). Read only the first.
    if (
      rows.length &&
      filled.length >= 2 &&
      filled.every((c) => !isDataCell(c)) &&
      filled.filter((c) => ROLES.some((role) => nameScore(role, c) >= 0.7)).length >= 2 &&
      row.map((c) => norm(c)).join('|') !== hnorm
    ) {
      secondTable = { line: i + 1, label: filled.slice(0, 3).join(', ') };
      break;
    }
    if (row.slice(0, 3).some((c) => TOTAL_RE.test(c))) {
      droppedTotals.push(i + 1);
      continue;
    }
    rows.push(row);
    lines.push(i + 1);
  }
  // Drop columns that are empty everywhere.
  const keep = headers.map((_, j) => rows.some((r) => r[j] !== ''));
  const headerLine = headerless ? 0 : nonEmpty.at(h).i + 1;
  if (keep.every(Boolean))
    return { headers, rows, lines, delimiter, headerLine, droppedTotals, notes, totalLines, secondTable };
  return {
    headers: headers.filter((_, j) => keep[j]),
    rows: rows.map((r) => r.filter((_, j) => keep[j])),
    lines,
    delimiter,
    headerLine,
    droppedTotals,
    notes,
    totalLines,
    secondTable,
  };
}

/** One column per month (a pivot/crosstab, e.g. from Tableau) → one row per item per month. */
export function unpivotMonths(t: Table): Table | null {
  const yearHint = t.headers.map((x) => x.match(/\b(19|20)\d{2}\b/)?.[0]).find(Boolean);
  const monthCols = t.headers
    .map((x, j) => ({ j, d: monthHeader(x, yearHint ? +yearHint : undefined) }))
    .filter((x) => x.d);
  if (monthCols.length < 3 || monthCols.length < t.headers.length * 0.4) return null;
  const numericShare =
    monthCols.reduce(
      (s, { j }) => s + t.rows.filter((r) => r[j] === '' || parseNumber(r[j]) !== null).length,
      0,
    ) /
    (monthCols.length * Math.max(1, t.rows.length));
  if (numericShare < 0.9) return null;
  const idCols = t.headers.map((_, j) => j).filter((j) => !monthCols.some((m) => m.j === j));
  const headers = [...idCols.map((j) => t.headers[j]), 'Month', 'Amount'];
  const rows: string[][] = [],
    lines: number[] = [];
  t.rows.forEach((r, i) => {
    for (const { j, d } of monthCols)
      if (r[j] !== '') {
        rows.push([...idCols.map((k) => r[k]), d!, r[j]]);
        lines.push(t.lines[i]);
      }
  });
  return {
    ...t,
    headers,
    rows,
    lines,
    how: `one column per month (${monthCols.length} months), turned into rows`,
  };
}
