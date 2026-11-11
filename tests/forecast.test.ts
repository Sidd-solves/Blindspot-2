import { describe, expect, it } from 'vitest';
import { forecastSales, monthlySeries, METHODS } from '@blindspot/analytics';
import type { Row } from '@blindspot/analytics';

/** One sale row per month (on the 15th), plus an optional last date to mark the final month full or partial. */
function rows(values: number[], { start = '2022-01', lastDay = 'end' } = {}): Row[] {
  const [y0, m0] = start.split('-').map(Number);
  const out: Row[] = values.map((v, i) => {
    const t = y0 * 12 + (m0 - 1) + i;
    const ym = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    return { OrderDate: `${ym}-01`, Sales: v, IsReturn: 0 };
  });
  const last = out[out.length - 1].OrderDate as string;
  const [ly, lm] = last.slice(0, 7).split('-').map(Number);
  const end = String(new Date(Date.UTC(ly, lm, 0)).getUTCDate());
  out.push({ OrderDate: `${last.slice(0, 8)}${lastDay === 'end' ? end : lastDay}`, Sales: 0, IsReturn: 0 });
  return out;
}
const seasonal = (years: number, scale = 1) =>
  Array.from({ length: years * 12 }, (_, i) => scale * (100 + 60 * Math.sin((2 * Math.PI * (i % 12)) / 12)));

describe('sales forecast', () => {
  it('never uses the future: changing later months leaves every earlier backtest forecast unchanged', () => {
    const base = seasonal(3);
    const a = forecastSales(rows(base), 'OrderDate', 'Sales');
    const changed = [...base];
    changed[changed.length - 1] *= 5; // a huge change in the very last month
    const b = forecastSales(rows(changed), 'OrderDate', 'Sales');
    // Every month before the changed one was forecast identically, including which method was used.
    for (let i = 0; i < a.backtest.length - 1; i++) {
      expect(b.backtest[i].predicted).toBe(a.backtest[i].predicted);
      expect(b.backtest[i].method).toBe(a.backtest[i].method);
    }
  });

  it('a repeating seasonal pattern is caught by a seasonal method and forecast almost exactly', () => {
    const r = forecastSales(rows(seasonal(3)), 'OrderDate', 'Sales');
    expect(r.ok).toBe(true);
    expect(r.method?.id).toBe('same-month-last-year');
    expect(r.accuracy.wape).toBeLessThan(0.01);
    // Next month = the same month last year.
    expect(r.forecast[0].value).toBeCloseTo(seasonal(3)[24], 1);
  });

  it('the accuracy shown is exactly the error of the forecasts listed, month by month', () => {
    const noisy = seasonal(3).map((v, i) => v * (1 + 0.15 * Math.sin(i * 7.3)));
    const r = forecastSales(rows(noisy), 'OrderDate', 'Sales');
    const abs = r.backtest.reduce((s, b) => s + Math.abs(b.actual - b.predicted), 0);
    const act = r.backtest.reduce((s, b) => s + b.actual, 0);
    expect(r.accuracy.wape!).toBeCloseTo(abs / act, 3);
    const inside = r.backtest.filter((b) => b.inside).length;
    expect(r.accuracy.hitRate!).toBeCloseTo(inside / r.accuracy.rangeTested, 3);
  });

  it('needs 6 full months, and skips seasonal methods with less than a year', () => {
    const short = forecastSales(rows([10, 12, 11, 13, 12]), 'OrderDate', 'Sales');
    expect(short.ok).toBe(false);
    expect(short.reason).toMatch(/at least 6 full months/);
    const r = forecastSales(rows([10, 12, 11, 13, 12, 14, 13, 15, 14]), 'OrderDate', 'Sales');
    expect(r.ok).toBe(true);
    const seasonalIds = METHODS.filter((m) => m.needs >= 12).map((m) => m.id);
    expect(r.backtest.every((b) => !seasonalIds.includes(b.method))).toBe(true);
    expect(r.notes.join(' ')).toMatch(/Less than a year/);
  });

  it('leaves an unfinished last month out of training and testing', () => {
    const vals = seasonal(2);
    const r = forecastSales(rows(vals, { lastDay: '09' }), 'OrderDate', 'Sales');
    expect(r.partialMonth).toBe('2023-12');
    expect(r.history.at(-1)!.month).toBe('2023-11');
    expect(r.forecast[0].month).toBe('2023-12');
  });

  it('counts months with no sales as zero instead of skipping them', () => {
    const data: Row[] = [
      { OrderDate: '2024-01-01', Sales: 100, IsReturn: 0 },
      { OrderDate: '2024-03-10', Sales: 50, IsReturn: 0 },
      { OrderDate: '2024-03-31', Sales: 0, IsReturn: 0 },
    ];
    const { months } = monthlySeries(data, 'OrderDate', 'Sales');
    expect(months).toEqual([
      { month: '2024-01', value: 100 },
      { month: '2024-02', value: 0 },
      { month: '2024-03', value: 50 },
    ]);
  });

  it('uses the same definition of sales as the dashboard: returns are not sales', () => {
    const data: Row[] = [
      { OrderDate: '2024-01-01', Sales: 100, IsReturn: 0 },
      { OrderDate: '2024-01-12', Sales: 40, IsReturn: 1 },
      { OrderDate: '2024-01-31', Sales: 0, IsReturn: 0 },
    ];
    expect(monthlySeries(data, 'OrderDate', 'Sales').months[0].value).toBe(100);
  });

  it('ranges widen further out, and each backtest range was built only from earlier misses', () => {
    const noisy = seasonal(3).map((v, i) => v * (1 + 0.1 * Math.sin(i * 5.1)));
    const r = forecastSales(rows(noisy), 'OrderDate', 'Sales');
    const width = (f: { value: number; low: number | null; high: number | null }) =>
      (f.high! - f.low!) / f.value;
    expect(width(r.forecast[1])).toBeGreaterThan(width(r.forecast[0]));
    expect(width(r.forecast[2])).toBeGreaterThan(width(r.forecast[1]));
    // The first three tested months have no earlier misses to learn from, so they show no range.
    expect(r.backtest.slice(0, 3).every((b) => b.low === null)).toBe(true);
    expect(r.backtest.slice(3).every((b) => b.low !== null && b.high !== null)).toBe(true);
  });

  it('says why when there are no dates', () => {
    const r = forecastSales([{ Sales: 5 }], null, 'Sales');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/date column/);
  });
});

describe('forecast in the product', () => {
  it('is a typed tool on the current data, and the no-AI analyst answers forecast questions with its track record', async () => {
    const { callTool, SessionState } = await import('@blindspot/tool-contracts');
    const { deterministicAnswer } = await import('../services/api/src/deterministic');
    const ctx = { state: new SessionState() };
    const r = await callTool(ctx, 'forecast-sales', { horizon: 2 });
    expect(r.ok).toBe(true);
    expect((r.data as any).forecast).toHaveLength(2);
    const a = await deterministicAnswer(ctx, 'What will sales be next month?');
    expect(a.answer).toMatch(/Track record: replayed on the last \d+ months/);
    expect(a.evidence.map((e: any) => e.tool)).toContain('forecast-sales');
  });

  it('the executive report includes the forecast and its accuracy', async () => {
    const { executiveSummary, analyzeSmart, generateSampleDataset } = await import('@blindspot/analytics');
    const ds = generateSampleDataset();
    const rep = executiveSummary(ds, analyzeSmart(ds));
    expect(rep.forecast.ok).toBe(true);
    expect(rep.markdown).toMatch(/## Sales forecast \(next 3 months\)/);
    expect(rep.markdown).toMatch(/off by \d+\.\d% on average/);
  });
});

describe('forecast fixes from review', () => {
  it('a £0 forecast that missed keeps counting toward the range, and an all-perfect record shows no fake range', () => {
    // Three empty months, then £100 every month: the first forecast after the jump is £0 against £100.
    const r = forecastSales(rows([0, 0, 0, 100, 100, 100, 100, 100, 100, 100]), 'OrderDate', 'Sales');
    expect(r.ok).toBe(true);
    const f = r.forecast[0];
    // The big early miss widens the range instead of disappearing from it.
    expect(f.low === null || f.high! - f.low! > 0).toBe(true);
    const perfect = forecastSales(rows([100, 100, 100, 100, 100, 100, 100, 100]), 'OrderDate', 'Sales');
    expect(perfect.forecast[0].low).toBeNull();
    expect(perfect.notes.join(' ')).toMatch(/no misses to size a range/);
  });

  it('a month counts as complete only when the data reaches its last day, and a mid-month start is dropped', () => {
    const endsOn28 = forecastSales(
      rows(Array(24).fill(100), { start: '2022-01', lastDay: '28' }),
      'OrderDate',
      'Sales',
    );
    expect(endsOn28.partialMonth).toBe('2023-12');
    const midStart: Row[] = [
      { OrderDate: '2022-01-20', Sales: 30, IsReturn: 0 },
      ...rows(Array(12).fill(100), { start: '2022-02' }),
    ];
    const r = forecastSales(midStart, 'OrderDate', 'Sales');
    expect(r.history[0].month).toBe('2022-02');
    expect(r.notes.join(' ')).toMatch(/starts mid-month/);
  });
});

describe('undefined accuracy is never shown as perfect', () => {
  it('eight months of zero sales: no percentage, and the phrase says why instead of "0.0%"', async () => {
    const { describeAccuracy } = await import('@blindspot/analytics');
    const r = forecastSales(rows(Array(8).fill(0)), 'OrderDate', 'Sales');
    expect(r.accuracy.wape).toBeNull();
    expect(r.accuracy.months).toBeGreaterThan(0);
    expect(r.accuracy.mae).toBe(0);
    const said = describeAccuracy(r.accuracy, (n) => `£${n}`);
    expect(said.percent).toBeNull();
    expect(said.sentence).not.toMatch(/0\.0%/);
    expect(said.sentence).toMatch(/percentage error is unavailable because actual sales .* totalled zero/);
  });

  it('the money miss is the plain average of the monthly misses listed', () => {
    const noisy = seasonal(3).map((v, i) => v * (1 + 0.15 * Math.sin(i * 7.3)));
    const r = forecastSales(rows(noisy), 'OrderDate', 'Sales');
    const abs = r.backtest.reduce((s, b) => s + Math.abs(b.actual - b.predicted), 0);
    expect(r.accuracy.mae!).toBeCloseTo(abs / r.backtest.length, 1);
  });

  it('the executive report and the no-AI analyst never print a percentage for zero sales', async () => {
    const { executiveSummary, analyzeSmart } = await import('@blindspot/analytics');
    const ds = { name: 'z', source: 'csv', label: 'z', currency: 'GBP', rows: rows(Array(8).fill(0)) } as any;
    const rep = executiveSummary(ds, analyzeSmart(ds));
    if (rep.forecast.ok) expect(rep.markdown).not.toMatch(/off by 0\.0%/);
  });
});
