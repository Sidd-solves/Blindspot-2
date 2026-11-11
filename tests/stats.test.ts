import { describe, it, expect } from 'vitest';
import { welchTest, tCdf, normCdf, bootstrapTest, bhAdjust, propTest, sum, testGeneric, generateSampleDataset, analyzeSmart, scanAnomalies, detectFields } from '@blindspot/analytics';

describe('significance tests match textbook values', () => {
  it('t and normal distributions', () => {
    expect(tCdf(2, 10)).toBeCloseTo(0.96331, 4);   // scipy.stats.t.cdf(2, 10)
    expect(tCdf(-1.5, 5)).toBeCloseTo(0.09695, 4);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4);
  });
  it('Welch t-test with Welch–Satterthwaite degrees of freedom', () => {
    const r = welchTest([1, 2, 3, 4, 5], [3, 4, 5, 6, 7, 8]); // scipy ttest_ind(equal_var=False): t=-2.402, p=0.0398
    expect(r.stat).toBeCloseTo(-2.402, 2); expect(r.p).toBeCloseTo(0.0398, 3); expect(r.df).toBeCloseTo(9, 0);
  });
  it('zero variance is explicit, not "no evidence"', () => {
    expect(welchTest([5, 5, 5], [3, 3, 3]).p).toBe(0);
    expect(welchTest([2, 2], [2, 2]).p).toBe(1);
  });
  it('two-proportion test, bootstrap and FDR adjustment', () => {
    expect(propTest(30, 100, 50, 100).p).toBeLessThan(0.01);
    expect(bootstrapTest([10, 12, 9, 11, 13, 10, 12, 11], [5, 6, 4, 5, 7, 6, 5, 6], sum).p).toBeLessThan(0.05);
    expect(bhAdjust([0.01, 0.04, 0.03, 0.5])).toEqual([0.04, 0.05333333333333334, 0.05333333333333334, 0.5]);
  });
});

describe('hypothesis verdicts are honest', () => {
  const rows = Array.from({ length: 400 }, (_, i) => ({ Group: i % 2 ? 'A' : 'B', Sales: 100 + (i % 2 ? 2 : 0) + ((i * 37) % 11) - 5 }));
  const ds = { name: 'x', source: 'csv' as const, label: 'x', rows };
  const h = (metric: 'avg' | 'sum', minEffect?: number) => testGeneric(ds, { claim: 'A beats B', level: 'row', metric, measure: 'Sales', a: { label: 'A', filters: [{ field: 'Group', op: 'eq', value: 'A' }] }, b: { label: 'B', filters: [{ field: 'Group', op: 'eq', value: 'B' }] }, expect: 'a>b', minEffect });
  it('a real but tiny difference is "small-effect", not "rejected"', () => {
    const r = h('avg', 0.05);
    expect(r.verdict).toBe('small-effect');
    expect(r.p).toBeLessThan(0.05);
  });
  it('sum comparisons use a computed bootstrap test, never a fixed statistic', () => {
    const r = h('sum', 0.001);
    expect(r.method).toMatch(/Bootstrap/);
    expect(r.stat!.value).not.toBe(2.5);
    expect(r.basis).toBe('tested');
  });
  it('opposite-direction evidence is "rejected"', () => {
    const r = testGeneric(ds, { claim: 'B beats A', level: 'row', metric: 'avg', measure: 'Sales', a: { label: 'B', filters: [{ field: 'Group', op: 'eq', value: 'B' }] }, b: { label: 'A', filters: [{ field: 'Group', op: 'eq', value: 'A' }] }, expect: 'a>b' });
    expect(r.verdict).toBe('rejected');
  });
});

describe('findings carry an honest evidence basis', () => {
  const ds = generateSampleDataset();
  it('every finding says how it is known; tested ones carry a p-value', () => {
    for (const f of analyzeSmart(ds)) {
      expect(['measured', 'tested', 'rule']).toContain(f.basis);
      if (f.basis === 'tested') { expect(f.pValue).not.toBeNull(); expect(f.pValue!).toBeLessThan(0.05); }
      else expect(f.pValue).toBeNull();
    }
  });
  it('the anomaly scan reports adjusted q-values and its coverage', () => {
    const s = scanAnomalies(ds.rows, detectFields(ds), { days: 90 })!;
    expect(s.coverage).toMatch(/adjusted/);
    for (const a of s.anomalies) expect(a.q).toBeLessThan(0.05);
  });
});
