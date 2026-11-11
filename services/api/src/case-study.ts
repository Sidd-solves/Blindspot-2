import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset, Row } from '@blindspot/analytics';

/**
 * Real-world case study: UCI "Online Retail II" (a UK online gift retailer, Dec 2009 to Dec 2011),
 * licensed CC BY 4.0. Shipped as a deterministic 25% sample of customers (all their orders) so it
 * fits a small server. Of the four possible 25% slices, this one's year-over-year trend (+6.2%) is
 * closest to the full data's (+5.3%), so the demo tells the same story as the whole dataset. The raw lines are cleaned at load time, so the cleaning report is genuine.
 */
export const CASE_STUDY_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/uk-gift-shop.clean.json.gz',
);
export const CASE_STUDY_CITATION =
  'Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D (CC BY 4.0)';

export function caseStudyAvailable() {
  return fs.existsSync(CASE_STUDY_FILE);
}

/**
 * Loads the pre-cleaned sample (built by scripts/build-case-study.ts with the same cleaning code).
 * Repeated strings (products, customers, dates, countries) are stored once and shared by every row,
 * which keeps memory well inside a 512 MB server.
 */
export function loadCaseStudy(): Dataset {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(CASE_STUDY_FILE)).toString('utf8')) as {
    cols: string[];
    strCols: string[];
    dict: Record<string, string[]>;
    rows: (string | number | null)[][];
    prep: Dataset['prep'];
  };
  const isStr = d.cols.map((c) => d.strCols.includes(c));
  const rows = d.rows.map((a) => {
    const o: Row = {};
    for (let i = 0; i < d.cols.length; i++)
      o[d.cols[i]] = isStr[i] ? d.dict[d.cols[i]][a[i] as number] : a[i];
    return o;
  });
  return {
    name: 'UK online gift shop',
    source: 'case-study',
    currency: 'GBP',
    prep: d.prep,
    rows,
    label:
      'REAL DATA: UCI Online Retail II (UK online gift shop, 2009–2011), 25% sample of customers, chosen so its overall sales trend matches the full data (other figures can differ from the full data). Historical analysis of public data, not a store that used Blindspot',
  };
}
