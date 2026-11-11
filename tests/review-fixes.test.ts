import { describe, it, expect } from 'vitest';
import { analyzeSmart, baselineOf, testGeneric, toMs, reportTopics, simulateScenario, corrTest, recommend, checkRuns, ingest, type Dataset, type Finding, type Row } from '@blindspot/analytics';
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
/** In pence, like the server: Math.round(x * 100) per row. */
const total = (rows: Row[]) => rows.reduce((s, r) => s + Math.abs(Math.round(((r.Sales as number) || 0) * 100)), 0) / 100;

describe('review fixes (real case study)', () => {
  const ds = loadCaseStudy();
  const findings = analyzeSmart(ds);

  it('every drill-through with a stated figure reproduces it exactly', () => {
    const withExpect = findings.filter((f) => f.drill?.expect);
    expect(withExpect.length).toBeGreaterThanOrEqual(3);
    for (const f of withExpect) {
      const got = total(exactRows(ds.rows, f.drill!));
      expect(Math.abs(got - f.drill!.expect!.value), f.id).toBeLessThan(0.006);
      expect(f.drill!.values.length, `${f.id} values not truncated`).toBe(f.drill!.totalValues ?? f.drill!.values.length);
    }
  });

  it('per-window drill totals match the before/now figures', () => {
    for (const f of findings.filter((x) => x.drill?.windows?.some((w) => w.expect != null))) {
      for (const w of f.drill!.windows!) {
        if (w.expect == null) continue;
        const got = total(exactRows(ds.rows, { ...f.drill!, windows: [w] }));
        expect(Math.abs(got - w.expect), `${f.id} ${w.label}`).toBeLessThan(0.006);
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

describe('review fixes, round 3', () => {
  const mk = (rows: Row[]): Dataset => ({ name: 't', label: 't', source: 'upload', rows } as unknown as Dataset);
  const groups = (a: number, b: number) => {
    const rows: Row[] = [];
    for (let i = 0; i < 40; i++) rows.push({ Group: 'A', Sales: a + (a ? (i % 5) : 0) }, { Group: 'B', Sales: b + (b ? (i % 5) : 0) });
    return mk(rows);
  };
  const claim = (ds: Dataset) => testGeneric(ds, { claim: 'A > B', level: 'row', metric: 'avg', measure: 'Sales', a: { label: 'A', filters: [{ field: 'Group', op: 'eq', value: 'A' }] }, b: { label: 'B', filters: [{ field: 'Group', op: 'eq', value: 'B' }] }, expect: 'a>b' });

  it('a positive group vs a zero baseline is material, with the percentage marked undefined', () => {
    const r = claim(groups(100, 0));
    expect(r.verdict).toBe('supported');
    expect(r.summary).toMatch(/percentage change undefined from zero/);
    expect(r.evidence.effect).toBeNull();
  });
  it('zero vs zero is not a finding', () => {
    expect(claim(groups(0, 0)).verdict).toBe('inconclusive');
  });
  it('a negative baseline uses its magnitude', () => {
    const r = claim(groups(-50, -100));
    expect(r.verdict).toBe('supported');
    expect(r.evidence.effect).toBeCloseTo(0.5, 1);
  });

  it('dependence is "not judged" with six customers, one product and 40 order IDs', () => {
    const rows: Row[] = [];
    for (let i = 0; i < 40; i++) rows.push({ Order: `o${i}`, Customer: `c${i % 6}`, Product: 'Mug', OrderDate: `2025-0${1 + (i % 6)}-01`, Sales: 10 + i, Quantity: 1, IsReturn: 0 });
    const ds = mk(rows), topics = reportTopics(ds, analyzeSmart(ds));
    const dep = topics.find((t) => t.key === 'customers')!;
    expect(dep.status).not.toBe('clear');
    expect(dep.note).toMatch(/Not judged/);
    expect((dep as any).check.ran).toBe(false);
  });

  it('a short observed period scales annual churn to that period', () => {
    const tenDays = 10 / 365.25;
    const r = simulateScenario({ revenue: 1000, profit: null, years: tenDays, basis: 'observed', period: 'over 10 days' }, { churnReductionPct: 5 }, { annualChurnRate: 0.2 });
    expect(r.horizonYears).toBeCloseTo(tenDays, 3);
    expect(r.delta.revenue).toBeLessThan(1);              // not £10: 20% a year is ~0.6% over 10 days
    expect(r.delta.revenue).toBeGreaterThan(0.2);
  });

  it('anomaly and watch findings label their value as a BH-adjusted q, with the raw p kept', () => {
    for (const f of analyzeSmart(loadCaseStudy()).filter((x) => x.category === 'anomaly')) {
      expect(f.pKind).toBe('q');
      expect(f.pRaw).not.toBeNull();
      expect(f.pRaw!).toBeLessThanOrEqual(f.pValue! + 1e-9);
    }
  });

  it('perfect correlation is certain in direction, with no fake statistic', () => {
    const t = corrTest(1, 30);
    expect(t.stat).toBeNull();
    expect(t.pGreater).toBe(0);
  });

  it('one action per intervention; the planning assumption travels with the benefit', () => {
    const acts = recommend(analyzeSmart(loadCaseStudy()));
    const names = acts.map((a) => a.intervention);
    expect(new Set(names).size).toBe(names.length);
    for (const a of acts.filter((x) => x.expectedBenefitUsd)) expect(a.recoveryPct).toBeGreaterThan(0);
  });
});

describe('review fixes, round 4', () => {
  const mk = (rows: Row[]): Dataset => ({ name: 't', label: 't', source: 'upload', rows } as unknown as Dataset);
  const f = (id: string, category: string, impact: number, period: string): Finding => ({ id, category, title: id, severity: 'high', confidence: 1, basis: 'measured', pValue: null, period, exposure: 'at-risk', metric: '', explanation: '', evidence: {}, impactUsd: impact, impactBasis: 'x', nextAction: '', score: 1 } as Finding);

  it('two findings over the same exposed sales are not added together', () => {
    const [a] = recommend([f('conc-Customer', 'concentration', 8200, 'whole file'), f('conc-Product', 'concentration', 8200, 'whole file')]);
    expect(a.expectedBenefitUsd).toBe(1230);                  // 15% of £8,200 once, not £2,460
    expect(a.parts).toHaveLength(2);
    expect(a.benefitBasis).toMatch(/not added/);
  });
  it('partial overlap and different periods: largest single estimate, with its own period', () => {
    const [a] = recommend([f('store-lapsed', 'retention', 10000, 'per year'), f('store-retention', 'retention', 4000, 'last 90 days')]);
    expect(a.expectedBenefitUsd).toBe(2000);
    expect(a.benefitPeriod).toBe('per year');
    expect(a.parts!.map((p) => p.period)).toEqual(['per year', 'last 90 days']);
  });

  it('a tiny difference from a zero baseline is real but not material, and stays readable', () => {
    const rows: Row[] = [];
    for (let i = 0; i < 40; i++) rows.push({ Group: 'A', Sales: 0.001 + (i % 5) * 1e-5 }, { Group: 'B', Sales: 0 }, { Group: 'C', Sales: 100 });
    const r = testGeneric(mk(rows), { claim: 'A > B', level: 'row', metric: 'avg', measure: 'Sales', a: { label: 'A', filters: [{ field: 'Group', op: 'eq', value: 'A' }] }, b: { label: 'B', filters: [{ field: 'Group', op: 'eq', value: 'B' }] }, expect: 'a>b' });
    expect(r.verdict).toBe('small-effect');
    expect(r.summary).not.toMatch(/\$0 vs \$0|difference \+\$0\b/);
  });

  it('each topic records which individual checks ran', () => {
    const rows: Row[] = [];
    for (let i = 0; i < 40; i++) rows.push({ Order: `o${i}`, Customer: `c${i % 6}`, Product: 'Mug', OrderDate: `2025-0${1 + (i % 9)}-01`, Sales: 10 + i, Quantity: 1, IsReturn: 0 });
    const ds = mk(rows), rep = reportTopics(ds, analyzeSmart(ds)).find((t) => t.key === 'retention')!;
    const c = (rep as any).check;
    expect(c.checks.find((x: any) => x.id === 'repeat-rate').ran).toBe(false);
    expect(c.coverage).not.toBe('full');
  });
});

describe('review fixes, round 5', () => {
  const mk = (rows: Row[]): Dataset => ({ name: 't', label: 't', source: 'upload', rows } as unknown as Dataset);
  // Six customers, one product, January to June; three good customers stop after March.
  const sixMonths = () => {
    const rows: Row[] = []; let o = 0;
    for (let m = 1; m <= 6; m++) for (let c = 0; c < 6; c++) {
      if (c < 3 && m > 3) continue;
      for (let k = 0; k < 2; k++) rows.push({ Order: `o${o++}`, Customer: `c${c}`, Product: 'Mug', OrderDate: `2025-0${m}-${String(5 + k * 10).padStart(2, '0')}`, Sales: c < 3 ? 120 : 20, Quantity: 1, IsReturn: 0 });
    }
    return mk(rows);
  };

  it('execution records come from the checks: a lapsed finding always has a matching "ran" record', () => {
    const ds = sixMonths(), f = analyzeSmart(ds), runs = checkRuns(ds);
    const lapsedRun = runs.find((r) => r.id === 'lapsed')!;
    expect(lapsedRun).toBeTruthy();
    if (f.some((x) => x.id === 'store-lapsed')) expect(lapsedRun.ran).toBe(true);
    const topic = reportTopics(ds, f).find((t) => t.key === 'retention')!;
    expect((topic as any).check.checks.find((c: any) => c.id === 'lapsed').ran).toBe(lapsedRun.ran);
  });

  it('short history: lapsed spending is labelled as observed months, not a year', () => {
    const lapsed = analyzeSmart(sixMonths()).find((x) => x.id === 'store-lapsed');
    if (lapsed) {
      expect(lapsed.title).not.toMatch(/a year/);
      expect(lapsed.period).toMatch(/months observed/);
      expect(lapsed.impactBasis).toMatch(/not annualised/);
    }
  });

  it('every check that ran over a period records its date range', () => {
    const runs = checkRuns(loadCaseStudy());
    for (const id of ['lapsed', 'stopped-products', 'decline']) {
      const r = runs.find((x) => x.id === id)!;
      expect(r.ran, id).toBe(true);
      expect(r.from, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('the upload report bridges rows read to records analysed', () => {
    const csv = ['Order,Date,Customer,Product,Qty,Total,Status',
      ...Array.from({ length: 20 }, (_, i) => `A${i},2025-01-${String(1 + i).padStart(2, '0')},c${i % 4},Mug,1,10,${i === 3 ? 'Refunded' : i === 5 ? 'Cancelled' : 'Paid'}`)].join('\n');
    const { report, dataset } = ingest([{ name: 'x.csv', text: csv }]);
    const b = report.bridge!;
    expect(b.read).toBe(20);
    expect(b.analysed).toBe(dataset.rows.length);
    expect(b.saleRecords + b.returnRecords).toBe(b.analysed);
    expect(b.used + b.refundRecordsAdded).toBe(b.analysed);
    expect(b.leftOut).toBe(b.read - b.used);
  });
});
