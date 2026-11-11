import fs from 'node:fs';
import { parseCsv, analyzeSmart } from '@blindspot/analytics';
const ds = parseCsv(fs.readFileSync('data/online_retail_ii.csv', 'utf8'), 'UK online gift shop (UCI Online Retail II)');
ds.currency = 'GBP';
let t = Date.now(); const f = analyzeSmart(ds); console.log(`analyzeSmart on ${ds.rows.length.toLocaleString()} rows: ${(Date.now() - t) / 1000}s, ${f.length} findings`);
for (const x of f) console.log(`  [${x.severity}] (${x.category}) ${x.title}`);
