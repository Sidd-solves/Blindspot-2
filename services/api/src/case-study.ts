import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, type Dataset } from '@blindspot/analytics';

/**
 * Real-world case study: UCI "Online Retail II" (a UK online gift retailer, Dec 2009 to Dec 2011),
 * licensed CC BY 4.0. Shipped as a deterministic 25% sample of customers (all their orders) so it
 * fits a small server. The raw lines are cleaned at load time, so the cleaning report is genuine.
 */
export const CASE_STUDY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/uk-gift-shop-sample.csv.gz');
export const CASE_STUDY_CITATION = 'Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D (CC BY 4.0)';

export function caseStudyAvailable() { return fs.existsSync(CASE_STUDY_FILE); }

export function loadCaseStudy(): Dataset {
  const csv = zlib.gunzipSync(fs.readFileSync(CASE_STUDY_FILE)).toString('utf8');
  const ds = parseCsv(csv, 'UK online gift shop');
  return { ...ds, source: 'case-study', currency: 'GBP', label: 'REAL DATA: UCI Online Retail II (UK online gift shop, 2009–2011), 25% random sample of customers' };
}
