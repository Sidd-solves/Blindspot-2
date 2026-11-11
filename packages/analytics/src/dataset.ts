import Papa from 'papaparse';
import type { Dataset, Row } from './types';
import { isShopifyOrderExport, shopifyExportToDataset } from './shopify';
import { prepareTransactions } from './retail';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATALOG: Record<string, { cat: string; margin: number; price: [number, number]; discount: [number, number]; items: string[] }> = {
  Technology: { cat: 'Technology', margin: 0.26, price: [120, 900], discount: [0, 0.15], items: ['Phones', 'Accessories', 'Copiers', 'Laptops'] },
  Furniture: { cat: 'Furniture', margin: 0.27, price: [90, 700], discount: [0.03, 0.2], items: ['Tables', 'Chairs', 'Bookcases', 'Furnishings'] },
  'Office Supplies': { cat: 'Office Supplies', margin: 0.19, price: [15, 220], discount: [0, 0.2], items: ['Binders', 'Paper', 'Storage', 'Labels'] },
};

/**
 * Deterministic SYNTHETIC demo data with planted, discoverable business problems:
 * heavy customer concentration, loss-making discounted Tables, and a Central-region decline.
 * It is not real company data and must always be labeled as such.
 */
export function generateSampleDataset(n = 1400, seed = 42): Dataset {
  const r = rng(seed);
  const regions = ['West', 'East', 'Central', 'South'];
  const regionW = [0.32, 0.28, 0.22, 0.18];
  const segments = ['Consumer', 'Corporate', 'Home Office'];
  const segW = [0.52, 0.3, 0.18];
  const cats = Object.keys(CATALOG);
  const catW = [0.34, 0.26, 0.4];
  const nCust = 70;
  const custW = Array.from({ length: nCust }, (_, i) => 1 / (i + 1) ** 1.15);
  const pick = (w: number[]) => {
    const t = w.reduce((a, b) => a + b, 0);
    let x = r() * t;
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
    return w.length - 1;
  };
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const month = Math.floor(r() * 24); // 0..23 => Jan-2023..Dec-2024
    const day = 1 + Math.floor(r() * 28);
    const region = regions[pick(regionW)];
    // Planted: Central collapses in the final 6 months
    if (region === 'Central' && month >= 18 && r() < 0.5) continue;
    const cat = CATALOG[cats[pick(catW)]];
    const item = cat.items[Math.floor(r() * cat.items.length)];
    const qty = 1 + Math.floor(r() * 5);
    let unit = cat.price[0] + r() * (cat.price[1] - cat.price[0]);
    let disc = cat.discount[0] + r() * (cat.discount[1] - cat.discount[0]);
    if (item === 'Tables') disc = 0.38 + r() * 0.22; // planted: over-discounting
    const c = pick(custW);
    if (c < 4 && r() < 0.5) unit *= 1.8; // top accounts buy bigger
    const sales = unit * qty * (1 - disc);
    const margin = cat.margin - disc * 0.9 + (r() - 0.5) * 0.08;
    const m = (month % 12) + 1, y = 2023 + Math.floor(month / 12);
    rows.push({
      OrderDate: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      Region: region,
      Segment: segments[pick(segW)],
      Category: Object.keys(CATALOG).find((k) => CATALOG[k] === cat)!,
      SubCategory: item,
      Customer: `Customer ${String(c + 1).padStart(2, '0')}`,
      Quantity: qty,
      Discount: Math.round(disc * 100) / 100,
      Sales: Math.round(sales * 100) / 100,
      Profit: Math.round(sales * margin * 100) / 100,
    });
  }
  return { name: 'Demo online shop', source: 'sample', label: 'SYNTHETIC DEMO DATA, a fictional small online shop', rows };
}

export function parseCsv(text: string, name = 'Uploaded CSV', maxRows = 1_200_000): Dataset {
  const ds = parseCsvRaw(text, name, maxRows);
  if (isShopifyOrderExport(ds.rows)) return shopifyExportToDataset(ds.rows, name);
  return prepareTransactions(ds.rows, name) ?? ds;
}

function parseCsvRaw(text: string, name: string, maxRows: number): Dataset {
  const res = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  const rows = (res.data as Row[]).slice(0, maxRows).map((row) => {
    const o: Row = {};
    for (const [k, v] of Object.entries(row)) o[k.trim()] = v === undefined || v === '' ? null : (v as any);
    return o;
  });
  return { name, source: 'csv', label: 'Uploaded CSV (untrusted input)', rows };
}
