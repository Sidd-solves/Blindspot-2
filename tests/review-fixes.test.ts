import { describe, it, expect } from 'vitest';
import { analyzeSmart, baselineOf, testGeneric, toMs, type Dataset, type Finding, type Row } from '@blindspot/analytics';
import { SessionState } from '@blindspot/tool-contracts';
import { loadCaseStudy } from '../services/api/src/case-study';

/** Same predicate the /api/rows drill-through applies with scope=exact. */
function exactRows(rows: Row[], d: NonNullable<Finding['drill']>) {
  const set = new Set(d.values);
  return rows.filter((r) => {
    if (!set.has(String(r[d.field] ?? ''))) return false;
    if (d.rowType === 'sale' && r.IsReturn === 1) return false;
    if (d.rowType === 'return' && r.IsReturn !== 1) return false;
    if (d.dateField && d.windows?.length) { const t = toMs(r[d.dateField]); if (!d.windows.some((w) => t >= w.from && t < w.to)) return false; }
    return true;
  });
}
const total = (rows: Row[]) => rows.reduce((s, r) => s + Math.abs((r.Sales as number) || 0), 0);

describe('review fixes (real case study)', () => {
  const ds = loadCaseStudy();
  const findings = analyzeSmart(ds);

  it('every drill-through with a stated figure reproduces it exactly', () => {
    const withExpect = findings.filter((f) => f.drill?.expect);
    expect(withExpect.length).toBeGreaterThanOrEqual(3);
    for (const f of withExpect) {
      const got = total(exactRows(ds.rows, f.drill!));
      expect(Math.abs(got - f.drill!.expect!.value), f.id).toBeLessThanOrEqual(Math.max(1, f.drill!.expect!.value * 0.001));
      expect(f.drill!.values.length, `${f.id} values not truncated`).toBe(f.drill!.totalValues ?? f.drill!.values.length);
    }
  });

  it('per-window drill totals match the before/now figures', () => {
    for (const f of findings.filter((x) => x.drill?.windows?.some((w) => w.expect != null))) {
      for (const w of f.drill!.windows!) {
        if (w.expect == null) continue;
        const got = total(exactRows(ds.rows, { ...f.drill!, windows: [w] }));
        expect(Math.abs(got - w.expect), `${f.id} ${w.label}`).toBeLessThanOrEqual(Math.max(1, w.expect * 0.001));
      }
    }
  });

  it('a country filter recounts reversed lines instead of reusing whole-file totals', () => {
    const st = new SessionState(ds);
    const whole = st.view().prep!;
    st.filters.set('Country', ['Denmark']);
    const dk = st.view();
    expect(dk.prep!.scope).toBe('filtered');
    expect(dk.prep!.cancelledPairs).toBeLessThan(whole.cancelledPairs);
    const sales = dk.rows.filter((r) => r.IsReturn !== 1).reduce((s, r) => s + ((r.Sales as number) || 0), 0);
    expect(dk.prep!.cancelledPairValue).toBeLessThan(sales);
    expect(analyzeSmart(dk).some((f) => f.id === 'store-cancelled-orders' && f.impactUsd === whole.cancelledPairValue)).toBe(false);
  });

  it('anomalies are tested on weekly revenue share, not individual lines', () => {
    for (const f of findings.filter((x) => x.category === 'anomaly')) {
      expect(f.explanation).toMatch(/weekly revenue share/);
      expect(f.evidence.weeks).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('review fixes (synthetic edge cases)', () => {
  const day = (m: number, d = 1) => `2025-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const mk = (rows: Row[]): Dataset => ({ name: 't', label: 't', source: 'upload', rows } as unknown as Dataset);

  it('six months of data is a labelled run rate, not "yearly revenue"', () => {
    const rows: Row[] = Array.from({ length: 6 }, (_, i) => ({ OrderDate: day(i + 1), Sales: 100 / 3, Product: 'A' }));
    rows.push({ OrderDate: day(6, 30), Sales: 0, Product: 'A' });
    const b = baselineOf(mk(rows));
    expect(b.basis).toBe('run-rate');
    expect(b.revenue).toBeGreaterThan(350);
    expect(b.period).toMatch(/run rate/);
  });

  it('under 30 days is not annualised', () => {
    const b = baselineOf(mk([{ OrderDate: day(1, 1), Sales: 50 }, { OrderDate: day(1, 10), Sales: 50 }]));
    expect(b.basis).toBe('observed');
    expect(b.revenue).toBe(100);
  });

  it('the displayed p-value is the one the verdict was decided on', () => {
    const rows: Row[] = [];
    for (let i = 0; i < 40; i++) rows.push({ Order: `a${i}`, Group: 'A', Sales: 100 + (i % 10) * 3 + 2 }, { Order: `b${i}`, Group: 'B', Sales: 100 + (i % 10) * 3 });
    const r = testGeneric(mk(rows), { claim: 'A > B', level: 'row', metric: 'avg', measure: 'Sales', a: { label: 'A', filters: [{ field: 'Group', op: 'eq', value: 'A' }] }, b: { label: 'B', filters: [{ field: 'Group', op: 'eq', value: 'B' }] }, expect: 'a>b', minEffect: 0 });
    expect(r.alternative).toMatch(/one-sided/);
    expect(r.p).not.toBeNull();
    expect(r.pTwoSided).toBeCloseTo(Math.min(1, 2 * r.p!), 3);
    if (r.verdict === 'supported') expect(r.p!).toBeLessThan(0.05);
    expect(r.summary).toContain('one-sided');
  });
});
