import { describe, it, expect } from 'vitest';
import { testGeneric, generateSampleDataset, analyzeSmart, interpretConcentration, profileData, simulateScenario, analyzeColors, generatePalette, auditDashboard, parseCsv, baselineOf } from '@blindspot/analytics';

const ds = generateSampleDataset();
describe('analytics engine', () => {
  it('sample data is labeled synthetic and deterministic', () => {
    expect(ds.label).toMatch(/SYNTHETIC/);
    expect(generateSampleDataset().rows[10]).toEqual(ds.rows[10]);
  });
  it('profiles columns with types', () => {
    const p = profileData(ds);
    expect(p.columns.find((c) => c.name === 'Sales')?.type).toBe('number');
    expect(p.columns.find((c) => c.name === 'OrderDate')?.type).toBe('date');
  });
  it('finds planted concentration, loss-making Tables, and Central decline', () => {
    const f = analyzeSmart(ds);
    console.log(f.slice(0, 6).map((x) => `${x.severity} ${x.score} ${x.title}`).join('\n'));
    expect(f.some((x) => x.category === 'concentration' && /customer/i.test(x.title))).toBe(true);
    expect(f.some((x) => x.category === 'profitability' && /Tables/.test(x.title))).toBe(true);
    expect(f.some((x) => (x.category === 'anomaly' || x.category === 'trend') && /Central/.test(x.title))).toBe(true);
    expect(f[0].score).toBeGreaterThanOrEqual(f[f.length - 1].score);
  });
  it('concentration shares are real percentages summing correctly', () => {
    const c = interpretConcentration(ds.rows, 'Customer', 'Sales');
    expect(c.top5Share).toBeGreaterThan(0.3);
    expect(c.groups.at(-1)!.cumShare).toBeLessThanOrEqual(1);
  });
  it('scenario uses explicit formulas', () => {
    const r = simulateScenario({ revenue: 1000, profit: 100 }, { opexReductionPct: 10 }, { opexRateOfRevenue: 0.1 });
    expect(r.delta.profit).toBe(10);
    expect(r.hypothetical).toBe(true);
  });
  it('color analysis detects low contrast and CVD clashes', () => {
    expect(analyzeColors(['#ffff00'], '#ffffff').passes).toBe(false);
    expect(analyzeColors(['#ff0000', '#ee1100']).cvdClashes.length).toBeGreaterThan(0);
    const pal = generatePalette(5, 'categorical');
    expect(pal.colors).toHaveLength(5);
    expect(pal.fullySafeCount).toBeGreaterThanOrEqual(4);
    expect(generatePalette(4, 'categorical').check.passes).toBe(true);
  });
  it('audits misleading charts', () => {
    const a = auditDashboard({ charts: [{ id: 'c1', type: 'bar', yAxisStartsAtZero: false }] });
    expect(a.issues.some((i) => i.area === 'chart-integrity')).toBe(true);
  });
  it('parses csv and computes baseline', () => {
    const d = parseCsv('Sales,Profit,Region\n100,10,A\n200,20,B');
    expect(baselineOf(d)).toEqual({ revenue: 300, profit: 30 });
  });
  it('removes orders reversed within 2 days from both sales and returns', () => {
    const csv = ['Invoice,StockCode,Description,Quantity,InvoiceDate,Price,Customer ID,Country',
      '1001,111,BIRDIE,80995,2011-12-09 09:15,2.08,16446,United Kingdom',
      'C1002,111,BIRDIE,-80995,2011-12-09 09:27,2.08,16446,United Kingdom',
      '1003,222,MUG,6,2011-12-01 10:00,2.5,12345,France',
      'C1004,222,MUG,-6,2011-12-20 10:00,2.5,12345,France'].join('\n');
    const d = parseCsv(csv, 't');
    expect(d.prep!.cancelledPairs).toBe(1);
    expect(d.prep!.cancelledPairValue).toBe(Math.round(80995 * 2.08));
    expect(d.rows.some((r) => r.Product === 'BIRDIE')).toBe(false);
    expect(d.rows.filter((r) => r.IsReturn === 1)).toHaveLength(1); // the 19-day-later return is a genuine return
  });
  it('hypothesis tester handles date filters and formats non-money measures plainly', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ OrderDate: `2011-${i < 100 ? '03' : '11'}-${String(1 + (i % 28)).padStart(2, '0')}`, Quantity: i < 100 ? 2 + (i % 3) : 6 + (i % 4), Sales: 10 }));
    const d = { name: 'x', source: 'csv' as const, label: 'x', rows };
    const h = testGeneric(d, { claim: 'Nov orders have more units than Mar', level: 'row', metric: 'avg', measure: 'Quantity', a: { label: 'Nov', filters: [{ field: 'OrderDate', op: 'between', value: ['2011-11-01', '2011-11-30'] }] }, b: { label: 'Mar', filters: [{ field: 'OrderDate', op: 'between', value: ['2011-03-01', '2011-03-31'] }] }, expect: 'a>b' });
    expect(h.verdict).toBe('supported');
    expect(h.summary).not.toMatch(/\$/);
    const none = testGeneric(d, { claim: 'x', level: 'row', metric: 'avg', measure: 'Quantity', a: { label: 'Jan', filters: [{ field: 'OrderDate', op: 'between', value: ['2011-01-01', '2011-01-31'] }] }, b: { label: 'Mar', filters: [] }, expect: 'a>b' });
    expect(none.summary).toMatch(/no orders matched/);
  });
});