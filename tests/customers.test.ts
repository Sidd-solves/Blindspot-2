import { describe, expect, it } from 'vitest';
import { analyzeSmart, earlyWarning, winBackList, type Dataset, type Row } from '@blindspot/analytics';
import { loadCaseStudy } from '../services/api/src/case-study';

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** One order per entry: [customer, day offset from 2024-01-01, amount]. */
function shop(orders: [string, number, number][], lastDay?: number): Dataset {
  const t0 = Date.UTC(2024, 0, 1);
  const rows: Row[] = orders.map(([c, d, v], i) => ({
    OrderDate: iso(t0 + d * DAY),
    Order: `o${i}`,
    Customer: c,
    Product: 'Mug',
    Sales: v,
    IsReturn: 0,
  }));
  if (lastDay !== undefined)
    rows.push({
      OrderDate: iso(t0 + lastDay * DAY),
      Order: 'end',
      Customer: 'Guest checkout',
      Product: 'Mug',
      Sales: 1,
      IsReturn: 0,
    });
  return { name: 't', source: 'csv', label: 't', rows, currency: 'GBP' } as Dataset;
}

describe('win-back list', () => {
  it('is exactly the "best customers who stopped ordering" finding: same people, same money to the penny', () => {
    const ds = loadCaseStudy();
    const f = analyzeSmart(ds).find((x) => x.id === 'store-lapsed')!;
    const wb = winBackList(ds);
    expect(wb.customers.length).toBe(f.evidence.lapsedCustomers);
    expect(Math.round(wb.total * 100)).toBe(Math.round(f.impactUsd! * 100));
    expect(new Set(wb.customers.map((c) => c.customer))).toEqual(new Set(f.drill!.values));
  });

  it('gives each customer what they used to buy and a draft message, and only uses an email when it is one', () => {
    const wb = winBackList(loadCaseStudy(), 'Harbor Gifts');
    const c = wb.customers[0];
    expect(c.topProducts.length).toBeGreaterThan(0);
    expect(c.message).toMatch(/Harbor Gifts/);
    expect(c.message.toLowerCase()).toContain(c.topProducts[0].toLowerCase());
    expect(wb.customers.every((x) => x.email === null || x.email.includes('@'))).toBe(true);
  });
});

describe('early warning', () => {
  it('flags repeat customers silent 45-90 days, ranked by what they spend', () => {
    const orders: [string, number, number][] = [];
    // A: regular, still ordering. B: regular, silent 60 days (warn). C: silent 120 days (already lost, not warned).
    for (let d = 0; d <= 300; d += 20) orders.push(['A', d, 50]);
    for (let d = 0; d <= 240; d += 20) orders.push(['B', d, 80]);
    for (let d = 0; d <= 180; d += 20) orders.push(['C', d, 90]);
    const ew = earlyWarning(shop(orders, 300));
    expect(ew.ok).toBe(true);
    expect(ew.customers.map((c) => c.customer)).toEqual(['B']);
    expect(ew.customers[0].silentDays).toBe(60);
    expect(ew.customers[0].typicalGapDays).toBe(20);
  });

  it('never looks ahead: the past replay only uses orders before its date', () => {
    const base: [string, number, number][] = [];
    for (let c = 0; c < 30; c++)
      for (let d = c % 7; d <= 200; d += 15 + (c % 5)) base.push([`c${c}`, d, 10 + c]);
    const a = earlyWarning(shop(base, 300));
    // Changing amounts after the replay date can't change who was flagged at that date.
    const later = base.map(([c, d, v]) => [c, d, d >= 210 ? v * 9 : v] as [string, number, number]);
    const b = earlyWarning(shop(later, 300));
    expect(b.backtest!.flagged).toBe(a.backtest!.flagged);
    expect(b.backtest!.others).toBe(a.backtest!.others);
  });

  it('on the real UK shop, flagged customers really did stay away more often (tested)', () => {
    const ew = earlyWarning(loadCaseStudy());
    const b = ew.backtest!;
    expect(b.flaggedStayedAway / b.flagged).toBeGreaterThan(b.othersStayedAway / b.others);
    expect(b.p!).toBeLessThan(0.05);
  });

  it('says why when the history is too short', () => {
    const ew = earlyWarning(
      shop(
        [
          ['A', 0, 5],
          ['A', 30, 5],
          ['A', 60, 5],
        ],
        90,
      ),
    );
    expect(ew.ok).toBe(false);
    expect(ew.reason).toMatch(/6 months/);
  });
});
