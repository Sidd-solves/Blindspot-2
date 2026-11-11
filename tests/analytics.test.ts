import { describe, it, expect } from 'vitest';
import { generateSampleDataset, analyzeSmart, interpretConcentration, profileData, simulateScenario, analyzeColors, generatePalette, auditDashboard, parseCsv, baselineOf } from '@blindspot/analytics';

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
});
