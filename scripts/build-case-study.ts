// Pre-cleans the case-study sample once, so the server loads compact, already-clean data at boot
// (cleaning 270k raw rows on a 512 MB server ran out of memory). Same code, same cleaning report.
import fs from 'node:fs'; import zlib from 'node:zlib';
import { parseCsv } from '@blindspot/analytics';
const src = 'data/uk-gift-shop-sample.csv.gz', out = 'services/api/data/uk-gift-shop.clean.json.gz';
const ds = parseCsv(zlib.gunzipSync(fs.readFileSync(src)).toString('utf8'), 'UK online gift shop');
const cols = Object.keys(ds.rows[0]);
const dict: Record<string, string[]> = {}, index: Record<string, Map<string, number>> = {};
const strCols = cols.filter((c) => typeof ds.rows[0][c] === 'string');
for (const c of strCols) { dict[c] = []; index[c] = new Map(); }
const rows = ds.rows.map((r) => cols.map((c) => {
  const v = r[c];
  if (!strCols.includes(c)) return v;
  const s = String(v); let i = index[c].get(s);
  if (i === undefined) { i = dict[c].push(s) - 1; index[c].set(s, i); }
  return i;
}));
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify({ cols, strCols, dict, rows, prep: ds.prep }), { level: 9 }));
console.log(`wrote ${out}: ${rows.length} clean rows, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB; dict sizes ${strCols.map((c) => `${c}=${dict[c].length}`).join(', ')}`);
