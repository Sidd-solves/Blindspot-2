/**
 * Held-out evaluation of the sales-gap detector.
 *
 * The burstiness adjustment and the 0.01 flag threshold were set on the calibration simulations in
 * tests/operations.test.ts (30 products × 400 days, seeds 11/108/205, 5 demand patterns). This script evaluates on
 * shops built differently: fresh seeds, 50 products, 500 trading days, different base rates and burst shapes. It
 * reports false flags on shops with no stock-outs, and detection of planted gaps of 15, 25 and 40 trading days.
 *
 *   npx tsx scripts/gap-eval.ts
 */
import { stockOuts, type Dataset, type Row } from '@blindspot/analytics';

const DAY = 86400000,
  T0 = Date.UTC(2023, 0, 2);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
type Kind = 'steady' | 'seasonal' | 'declining' | 'bursty' | 'overdispersed';
const KINDS: Kind[] = ['steady', 'seasonal', 'declining', 'bursty', 'overdispersed'];

function shop(kind: Kind, seed0: number, gap?: { len: number; at: number }) {
  let seed = seed0;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const pois = (l: number) => {
    let k = 0,
      p = Math.exp(-l),
      c = p;
    const u = rnd();
    while (u > c && k < 200) {
      p *= l / ++k;
      c += p;
    }
    return k;
  };
  const P = 50,
    D = 500;
  const rows: Row[] = [];
  const burst = new Array(P).fill(0);
  let o = 0;
  for (let d = 0; d < D; d++) {
    rows.push({
      OrderDate: iso(T0 + d * DAY),
      Order: `b${o++}`,
      Customer: 'x',
      Product: 'Bg',
      Sales: 5,
      IsReturn: 0,
    });
    for (let p = 0; p < P; p++) {
      // Product 0 carries the planted gap and sells about 1.5 a day; the rest 0.4–2.0 a day.
      const base = gap && p === 0 ? 1.5 : 0.4 + (p % 7) * 0.27;
      let l = base;
      if (kind === 'seasonal') l = base * (1 + 0.6 * Math.cos((2 * Math.PI * d) / 365 + p * 0.7));
      if (kind === 'declining') l = base * (1.4 - (0.9 * d) / D);
      if (kind === 'bursty') {
        if (rnd() < 0.04) burst[p] = 4 + Math.floor(rnd() * 6);
        l = burst[p] > 0 ? base * 2.5 : base * 0.6;
        burst[p] = Math.max(0, burst[p] - 1);
      }
      if (kind === 'overdispersed') {
        // Gamma(2) mixing: variance above Poisson, but less extreme than the calibration's exponential.
        l = (base * (-Math.log(rnd() + 1e-9) - Math.log(rnd() + 1e-9))) / 2;
      }
      if (gap && p === 0 && d >= gap.at && d < gap.at + gap.len) l = 0;
      for (let k = pois(Math.max(0, l)); k > 0; k--)
        rows.push({
          OrderDate: iso(T0 + d * DAY),
          Order: `o${o++}`,
          Customer: 'y',
          Product: `P${p}`,
          Sales: 10,
          IsReturn: 0,
        });
    }
  }
  return { name: 'e', source: 'csv', label: 'e', rows, currency: 'GBP' } as Dataset;
}

const SEEDS = [9001, 9002, 9003, 9004, 9005, 9006];
const out: Record<string, unknown>[] = [];
for (const kind of KINDS) {
  let flags = 0,
    histories = 0;
  for (const s of SEEDS) {
    const r = stockOuts(shop(kind, s));
    flags += r.items.length;
    histories += r.scanned;
  }
  const caught: Record<number, string> = {};
  for (const len of [15, 25, 40]) {
    let hit = 0;
    for (const s of SEEDS)
      if (stockOuts(shop(kind, s + 100, { len, at: 260 })).items.some((i) => i.product === 'P0')) hit++;
    caught[len] = `${hit}/${SEEDS.length}`;
  }
  out.push({
    demand: kind,
    falseFlags: `${flags}/${histories}`,
    caught15: caught[15],
    caught25: caught[25],
    caught40: caught[40],
  });
}
console.table(out);
