/**
 * Speed test: read + clean a sales file, then run the full analysis, and print the timings.
 *
 *   npm run bench                 # the real UCI Online Retail II file if it's in data/, else 1M generated rows
 *   npm run bench -- 200000       # generated rows of that size
 *   npm run bench -- my-file.csv  # any sales export
 *
 * The real file is free from https://archive.ics.uci.edu/dataset/502/online+retail+ii (save as data/online_retail_ii.csv).
 */
import fs from 'node:fs';
import os from 'node:os';
import { parseCsv, analyzeSmart, profileData } from '@blindspot/analytics';

const arg = process.argv[2];
const REAL = 'data/online_retail_ii.csv';

/** Rows shaped like the UCI export: repeat customers, seasonality, a few returns. Seeded, so every run is the same. */
function generate(n: number): string {
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const countries = [
    'United Kingdom',
    'United Kingdom',
    'United Kingdom',
    'Germany',
    'France',
    'EIRE',
    'Spain',
  ];
  const out = ['Invoice,StockCode,Description,Quantity,InvoiceDate,Price,Customer ID,Country'];
  const start = Date.UTC(2009, 11, 1);
  for (let i = 0, inv = 500000; i < n; i++) {
    if (i % 18 === 0) inv++;
    const day = Math.floor(rnd() * 730);
    const d = new Date(start + day * 86400000 + Math.floor(rnd() * 36000) * 1000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');
    const p = 100 + Math.floor(rnd() ** 2 * 3000);
    const ret = rnd() < 0.02;
    out.push(
      `${ret ? 'C' : ''}${inv},${p},PRODUCT ${p},${ret ? -1 : 1 + Math.floor(rnd() * 12)},${d},${(0.5 + rnd() * 9).toFixed(2)},${12000 + Math.floor(rnd() ** 1.5 * 5000)},${countries[Math.floor(rnd() * countries.length)]}`,
    );
  }
  return out.join('\n');
}

const t0 = performance.now();
const [label, text] =
  arg && !/^\d+$/.test(arg)
    ? [arg, fs.readFileSync(arg, 'utf8')]
    : !arg && fs.existsSync(REAL)
      ? ['UCI Online Retail II (real)', fs.readFileSync(REAL, 'utf8')]
      : [`${Number(arg ?? 1_000_000).toLocaleString()} generated rows`, generate(Number(arg ?? 1_000_000))];
const tLoad = performance.now();
const ds = parseCsv(text, label);
const tClean = performance.now();
profileData(ds);
const findings = analyzeSmart(ds);
const tAnalyze = performance.now();

const s = (a: number, b: number) => `${((b - a) / 1000).toFixed(1)} s`;
console.log(`\nBlindspot speed test · ${label}`);
console.log(`  machine          ${os.cpus()[0]?.model ?? 'unknown'} · Node ${process.version}`);
console.log(`  rows in file     ${(text.split('\n').filter(Boolean).length - 1).toLocaleString()}`);
console.log(`  read file        ${s(t0, tLoad)}`);
console.log(`  read + clean     ${s(tLoad, tClean)}  → ${ds.rows.length.toLocaleString()} clean records`);
console.log(`  analysis         ${s(tClean, tAnalyze)}  → ${findings.length} findings`);
