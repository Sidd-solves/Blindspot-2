import { describe, expect, it } from 'vitest';
import { cashRadar, stockOuts, type Dataset, type Row } from '@blindspot/analytics';
import { loadCaseStudy } from '../services/api/src/case-study';

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const T0 = Date.UTC(2024, 0, 1);
const ds = (rows: Row[]): Dataset =>
  ({ name: 't', source: 'csv', label: 't', rows, currency: 'GBP' }) as Dataset;

/** A steady background product sold every day keeps the shop "trading", plus the product under test. */
function shop(days: number, sells: (d: number) => number, opts: { closed?: (d: number) => boolean } = {}) {
  const rows: Row[] = [];
  let o = 0;
  for (let d = 0; d < days; d++) {
    if (opts.closed?.(d)) continue;
    rows.push({
      OrderDate: iso(T0 + d * DAY),
      Order: `b${o++}`,
      Customer: 'x',
      Product: 'Background',
      Sales: 5,
      IsReturn: 0,
    });
    for (let k = 0; k < sells(d); k++)
      rows.push({
        OrderDate: iso(T0 + d * DAY),
        Order: `p${o++}`,
        Customer: 'y',
        Product: 'Widget',
        Sales: 20,
        IsReturn: 0,
      });
  }
  return ds(rows);
}

describe('stock-out detector', () => {
  it('finds a product that sold every day, went silent for two weeks, then came back', () => {
    const r = stockOuts(shop(240, (d) => (d >= 100 && d < 114 ? 0 : 2)));
    const w = r.items.find((i) => i.product === 'Widget')!;
    expect(w).toBeTruthy();
    expect(w.tradingDays).toBe(14);
    expect(w.from).toBe(iso(T0 + 100 * DAY));
    expect(w.lostSales).toBeCloseTo(2 * 20 * 14, 0); // usual daily sales × days silent
    expect(w.adjusted).toBeLessThan(0.01);
  });

  it('days the whole shop was closed are not counted as silence', () => {
    // Closed for 10 days: the widget sells every open day, so there is no gap at all.
    const r = stockOuts(shop(240, () => 2, { closed: (d) => d >= 100 && d < 110 }));
    expect(r.items.find((i) => i.product === 'Widget')).toBeUndefined();
  });

  it('a product that is off sale for months is not called a stock-out', () => {
    const r = stockOuts(shop(300, (d) => (d >= 80 && d < 200 ? 0 : 2)));
    expect(r.items.find((i) => i.product === 'Widget')).toBeUndefined();
  });

  it('a product that sells now and then is not flagged for ordinary quiet spells', () => {
    // Sells on about 1 in 4 days, in a fixed irregular pattern: short silences are normal for it.
    const r = stockOuts(shop(240, (d) => ((d * 7) % 4 === 0 ? 1 : 0)));
    expect(r.items.find((i) => i.product === 'Widget')).toBeUndefined();
  });

  it('a silence still running at the end is "stopped selling", not a stock-out', () => {
    const r = stockOuts(shop(240, (d) => (d >= 225 ? 0 : 2)));
    expect(r.items.find((i) => i.product === 'Widget')).toBeUndefined();
  });

  it('splitting an order into more lines changes nothing: evidence counts orders, not rows', () => {
    const build = (linesPerOrder: number) => {
      const rows: Row[] = [];
      for (let d = 0; d < 240; d++) {
        rows.push({
          OrderDate: iso(T0 + d * DAY),
          Order: `b${d}`,
          Customer: 'x',
          Product: 'Background',
          Sales: 5,
          IsReturn: 0,
        });
        if (d >= 100 && d < 114) continue;
        for (let k = 0; k < linesPerOrder; k++)
          rows.push({
            OrderDate: iso(T0 + d * DAY),
            Order: `w${d}`,
            Customer: 'y',
            Product: 'Widget',
            Sales: 20 / linesPerOrder,
            IsReturn: 0,
          });
      }
      return stockOuts(ds(rows)).items.find((i) => i.product === 'Widget')!;
    };
    const one = build(1),
      ten = build(10);
    expect(ten.score).toBe(one.score);
    expect(ten.rateBefore).toBe(one.rateBefore);
    expect(ten.lostSales).toBeCloseTo(one.lostSales, 6);
  });

  /** 30 products for 400 trading days with no stock-outs at all, under different demand patterns. */
  const demand = (
    kind: 'steady' | 'seasonal' | 'bursty' | 'overdispersed',
    seed0: number,
    gapAt?: number,
  ) => {
    let seed = seed0;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pois = (l: number) => {
      let k = 0,
        p = Math.exp(-l),
        c = p;
      const u = rnd();
      while (u > c) {
        p *= l / ++k;
        c += p;
      }
      return k;
    };
    const rows: Row[] = [];
    const burst = new Array(30).fill(0);
    let o = 0;
    for (let d = 0; d < 400; d++) {
      rows.push({
        OrderDate: iso(T0 + d * DAY),
        Order: `b${o++}`,
        Customer: 'x',
        Product: 'Bg',
        Sales: 5,
        IsReturn: 0,
      });
      for (let p = 0; p < 30; p++) {
        const base = gapAt !== undefined && p === 0 ? 2 : 0.6 + (p % 5) * 0.25;
        let l = base;
        if (kind === 'seasonal') l = base * (1 + 0.8 * Math.sin((2 * Math.PI * d) / 365 + p));
        if (kind === 'bursty') {
          if (rnd() < 0.05) burst[p] = 6;
          l = burst[p] > 0 ? base * 3 : base * 0.5;
          burst[p] = Math.max(0, burst[p] - 1);
        }
        if (kind === 'overdispersed') l = base * -Math.log(rnd() + 1e-9);
        if (gapAt !== undefined && p === 0 && d >= gapAt && d < gapAt + 25) l = 0;
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
    return ds(rows);
  };

  it.each(['steady', 'seasonal', 'bursty', 'overdispersed'] as const)(
    'at most one false flag under %s demand with no stock-outs (3 seeds × 30 products)',
    (kind) => {
      // Measured separately: 1 false flag in 1,500 product histories across five demand patterns.
      const flags = [11, 108, 205].reduce((n, seed) => n + stockOuts(demand(kind, seed)).items.length, 0);
      expect(flags).toBeLessThanOrEqual(1);
    },
  );

  it('still catches a real 25-trading-day stock-out in a steadily selling product', () => {
    for (const seed of [5, 36, 67])
      expect(stockOuts(demand('steady', seed, 200)).items.map((i) => i.product)).toContain('P0');
  });

  it('declines without order IDs instead of treating lines as orders', () => {
    const rows = shop(240, (d) => (d >= 100 && d < 114 ? 0 : 2)).rows.map(({ Order: _o, ...r }) => r);
    const r = stockOuts(ds(rows));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/None of sales in this file carry an order number/);
  });

  it('checks order numbers per product: a well-labelled big seller cannot carry a small product without them', () => {
    // Background: 10 orders a day, all with IDs. Widget: 2 a day, no IDs, with a 14-day gap that would be flagged.
    const rows: Row[] = [];
    let o = 0;
    for (let d = 0; d < 240; d++) {
      for (let k = 0; k < 10; k++)
        rows.push({
          OrderDate: iso(T0 + d * DAY),
          Order: `b${o++}`,
          Customer: 'x',
          Product: 'Big',
          Sales: 5,
          IsReturn: 0,
        });
      if (d >= 100 && d < 114) continue;
      for (let k = 0; k < 2; k++)
        rows.push({ OrderDate: iso(T0 + d * DAY), Customer: 'y', Product: 'Widget', Sales: 20, IsReturn: 0 });
    }
    // Overall 83% of sale rows have IDs, so a file-wide check at 95% would decline; at a looser global bar the widget
    // would slip through. Per product, the big seller is tested and the widget is skipped and counted.
    const r = stockOuts(ds(rows));
    expect(r.ok).toBe(true);
    expect(r.scanned).toBe(1);
    expect(r.skippedNoOrderIds).toBe(1);
    expect(r.items.find((i) => i.product === 'Widget')).toBeUndefined();
    // Same shape with 97% overall IDs (many more big-seller rows) still skips the widget.
    const more = rows.concat(
      Array.from({ length: 30000 }, (_, i) => ({
        OrderDate: iso(T0 + (i % 240) * DAY),
        Order: `x${i}`,
        Customer: 'x',
        Product: 'Big',
        Sales: 5,
        IsReturn: 0,
      })),
    );
    const r2 = stockOuts(ds(more));
    expect(r2.skippedNoOrderIds).toBe(1);
    expect(r2.items.find((i) => i.product === 'Widget')).toBeUndefined();
  });

  it('reports a share of order numbers that matches the file, instead of "most sales"', () => {
    const base = shop(240, () => 2).rows;
    const rows = base.map((r, i) => (i % 10 < 5 ? (({ Order: _o, ...x }) => x)(r) : r));
    const r = stockOuts(ds(rows));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Only 50% of sales/);
  });

  it('publishes its measured false-alarm and detection rates with every result', () => {
    const r = stockOuts(shop(240, () => 2));
    expect(r.performance.falseFlags.histories).toBeGreaterThan(1000);
    expect(r.performance.detection.map((d) => d.demand)).toEqual(
      expect.arrayContaining(['steady', 'seasonal', 'bursty']),
    );
    expect(r.method).toMatch(/not a calibrated p-value/);
  });

  it('is calibrated: steady random sales with no stock-outs are not flagged', () => {
    // 60 products ordered at random (Poisson, about 1 order a trading day) for 400 days, seeded so it's repeatable.
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const poisson = (l: number) => {
      let k = 0,
        p = Math.exp(-l),
        c = p;
      const u = rnd();
      while (u > c) {
        p *= l / ++k;
        c += p;
      }
      return k;
    };
    const rows: Row[] = [];
    let o = 0;
    for (let d = 0; d < 400; d++) {
      rows.push({
        OrderDate: iso(T0 + d * DAY),
        Order: `b${o++}`,
        Customer: 'x',
        Product: 'Background',
        Sales: 5,
        IsReturn: 0,
      });
      for (let p = 0; p < 60; p++)
        for (let k = poisson(0.6 + (p % 5) * 0.2); k > 0; k--)
          rows.push({
            OrderDate: iso(T0 + d * DAY),
            Order: `o${o++}`,
            Customer: 'y',
            Product: `P${p}`,
            Sales: 10,
            IsReturn: 0,
          });
    }
    expect(stockOuts(ds(rows)).items).toHaveLength(0);
  });

  it('on the real UK shop every reported gap clears the adjusted score threshold and resumed afterwards', () => {
    const r = stockOuts(loadCaseStudy());
    expect(r.items.length).toBeGreaterThan(0);
    for (const i of r.items) {
      expect(i.adjusted).toBeLessThan(0.01);
      expect(i.tradingDays).toBeGreaterThanOrEqual(5);
      expect(i.tradingDays).toBeLessThanOrEqual(60);
      expect(i.rateAfter).toBeGreaterThanOrEqual(i.rateBefore * 0.5);
    }
  });
});

describe('cash-crunch radar', () => {
  /** Two years, January and February at half the usual level every year. */
  const seasonal = () => {
    const rows: Row[] = [];
    for (let m = 0; m < 24; m++) {
      const month = m % 12,
        v = month < 2 ? 500 : 1000;
      const date = `${2023 + Math.floor(m / 12)}-${String(month + 1).padStart(2, '0')}`;
      rows.push({ OrderDate: `${date}-01`, Order: `a${m}`, Customer: 'x', Sales: v / 2, IsReturn: 0 });
      const end = new Date(Date.UTC(2023 + Math.floor(m / 12), month + 1, 0)).getUTCDate();
      rows.push({ OrderDate: `${date}-${end}`, Order: `b${m}`, Customer: 'x', Sales: v / 2, IsReturn: 0 });
    }
    return ds(rows);
  };

  it('finds the months that are slow every year and sizes the gap', () => {
    const r = cashRadar(seasonal());
    expect(r.ok).toBe(true);
    expect(r.years.length).toBe(2);
    expect(r.crunch.map((c) => c.label)).toEqual(['Jan', 'Feb']);
    const avg = (10 * 1000 + 2 * 500) / 12;
    expect(r.averageMonth).toBeCloseTo(avg, 1);
    expect(r.crunch[0].gap).toBeCloseTo(avg - 500, 1);
  });

  it('a month that is slow in only one of the years is not called a crunch', () => {
    const d = seasonal();
    // Make March slow in 2023 only.
    for (const r of d.rows) if (String(r.OrderDate).startsWith('2023-03')) r.Sales = 200;
    const r = cashRadar(d);
    expect(r.crunch.map((c) => c.label)).not.toContain('Mar');
  });

  it('needs a full year', () => {
    const r = cashRadar(
      ds([
        { OrderDate: '2024-01-05', Sales: 5 },
        { OrderDate: '2024-06-28', Sales: 5 },
      ]),
    );
    expect(r.ok).toBe(false);
  });
});
