import { describe, expect, it } from 'vitest';
import { factCheck, parseClaims } from '../services/api/src/verify';

const ev = [
  {
    tool: 'analyze-dashboard-smart',
    data: {
      impactUsd: 93531.25,
      share: 0.4183,
      n: 166,
      total: 4400000,
      customers: Array.from({ length: 10 }, (_, i) => `c${i}`),
    },
  },
  { tool: 'forecast-sales', data: { forecast: [{ value: 156432.1 }], accuracy: { wape: 0.091 } } },
];

describe('fact-checking AI answers against tool results', () => {
  it('accepts figures at the precision they were written', () => {
    const r = factCheck(
      '10 best customers went quiet (£93,531 a year, 41.8% of revenue); next month ≈ £156.4K, off by 9.1%.',
      ev,
    );
    expect(r.claims.map((c) => [c.text, c.status])).toEqual([
      ['10', 'verified'],
      ['£93,531', 'verified'],
      ['41.8%', 'verified'],
      ['£156.4K', 'verified'],
      ['9.1%', 'verified'],
    ]);
    expect(r.claims[0].source).toBe('analyze-dashboard-smart');
  });

  it('flags a number that is not in any tool result', () => {
    const r = factCheck('You lost £120,000 to churn and 55% of buyers left.', ev);
    expect(r.unverified).toBe(2);
    expect(r.claims.every((c) => c.status === 'unverified')).toBe(true);
  });

  it('a rounded figure must still round from the real value', () => {
    expect(factCheck('£94K at stake', ev).verified).toBe(1); // 93,531 rounds to 94K
    expect(factCheck('£95K at stake', ev).unverified).toBe(1); // it doesn't round to 95K
    expect(factCheck('£93,600 at stake', ev).unverified).toBe(1); // too precise to be a rounding
  });

  it('sums, differences and ratios of tool numbers count as derived, not verified', () => {
    const r = factCheck('That leaves £4,306,468.75 from everyone else.', ev); // 4,400,000 − 93,531.25
    expect(r.claims[0].status).toBe('derived');
  });

  it('skips years, dates, list counts and labels', () => {
    expect(parseClaims('In 2011, from 2010-09-11 to 2011-09-10, 3 tips for Q4.').map((c) => c.text)).toEqual(
      [],
    );
  });

  it('reads K, M, ×, and comma formats', () => {
    expect(parseClaims('£4.4M, 1.8× as often, 12,345 orders, $3.2K').map((c) => c.value)).toEqual([
      4.4e6, 1.8, 12345, 3200,
    ]);
  });
});
