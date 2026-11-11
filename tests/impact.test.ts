import { describe, expect, it } from 'vitest';
import { eventImpact, type Dataset, type Row } from '@blindspot/analytics';

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const T0 = Date.UTC(2022, 0, 3); // a Monday

/** Daily sales for `weeks` weeks: a seasonal wave, a fixed wobble, and optionally a lift from `liftAt` on. */
function shop(weeks: number, lift = 0, liftAt = Infinity): Dataset {
  const rows: Row[] = [];
  for (let d = 0; d < weeks * 7; d++) {
    const w = Math.floor(d / 7);
    const season = 100 + 40 * Math.sin((2 * Math.PI * (w % 52)) / 52);
    const wobble = 1 + 0.06 * Math.sin(d * 2.7);
    const v = season * wobble * (w >= liftAt ? 1 + lift : 1);
    for (const [country, share] of [
      ['UK', 0.6],
      ['FR', 0.4],
    ] as const)
      rows.push({
        OrderDate: iso(T0 + d * DAY),
        Order: `${country}${d}`,
        Customer: 'c',
        Country: country,
        Sales: v * share,
        IsReturn: 0,
      });
  }
  return { name: 't', source: 'csv', label: 't', rows, currency: 'GBP' } as Dataset;
}
const dateOfWeek = (w: number) => iso(T0 + w * 7 * DAY);

describe('was it the promo?', () => {
  it('detects a real 25% lift after the date, controlling for the season', () => {
    const r = eventImpact(shop(110, 0.25, 90), { date: dateOfWeek(90) });
    expect(r.ok).toBe(true);
    expect(r.control).toBe('same-weeks-last-year');
    expect(r.verdict).toBe('rose');
    expect(r.effect!).toBeGreaterThan(0.2);
    expect(r.effect!).toBeLessThan(0.3);
    expect(r.extra).toBeGreaterThan(0);
    // A lift that big never happens by chance anywhere else in this history.
    expect(r.placebo.rate).toBe(0);
  });

  it('does not credit the date with the season: a seasonal rise alone is "no clear change"', () => {
    // Week 64 sits on the rising part of the yearly wave; nothing was changed.
    const r = eventImpact(shop(110), { date: dateOfWeek(64) });
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe('no-clear-change');
    expect(Math.abs(r.effect!)).toBeLessThan(0.05);
  });

  it('without a year of history it still answers, and says the season is not controlled', () => {
    const r = eventImpact(shop(40, 0.3, 25), { date: dateOfWeek(25) });
    expect(r.ok).toBe(true);
    expect(r.control).toBe('none');
    expect(r.method).toMatch(/season is not controlled/);
  });

  it('can judge one slice of the shop', () => {
    const r = eventImpact(shop(110, 0.25, 90), {
      date: dateOfWeek(90),
      filter: { field: 'Country', value: 'UK' },
    });
    expect(r.ok).toBe(true);
    expect(r.label).toBe('Country = UK');
    expect(r.verdict).toBe('rose');
  });

  it('refuses dates without enough weeks before or after', () => {
    expect(eventImpact(shop(110), { date: dateOfWeek(3) }).reason).toMatch(/weeks of sales before/);
    expect(eventImpact(shop(110), { date: dateOfWeek(108) }).reason).toMatch(/at least 3 full weeks after/);
  });

  it('the weekly chart covers the 8 weeks before and the weeks after, with an expected line', () => {
    const r = eventImpact(shop(110, 0.25, 90), { date: dateOfWeek(90), weeks: 6 });
    expect(r.weekly.filter((w) => w.phase === 'before')).toHaveLength(8);
    expect(r.weekly.filter((w) => w.phase === 'after')).toHaveLength(6);
    expect(r.weekly.every((w) => w.expected >= 0)).toBe(true);
  });
});
