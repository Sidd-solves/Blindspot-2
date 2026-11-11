import { motion } from 'framer-motion';
import { Fragment, useState, type CSSProperties } from 'react';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, Info, PackageX, Table2, Wallet } from 'lucide-react';
import { usd } from '../api';
import { useStore } from '../store';
import { ToolError, useTool } from '../components/useTool';
import { Card, CardHead, Chip, CountUp, Empty, Loading, stagger } from '../components/ui';
import { ChartTip, axis } from '../components/charts';
import { go } from '../App';
import { Confidence } from '../components/Confidence';

type SO = {
  ok: boolean;
  reason?: string;
  scanned: number;
  method: string;
  items: {
    product: string;
    from: string;
    to: string;
    tradingDays: number;
    rateBefore: number;
    rateAfter: number;
    score: number;
    adjusted: number;
    lostSales: number;
  }[];
  skippedNoOrderIds: number;
  performance: {
    falseFlags: { flagged: number; histories: number; note: string };
    detection: { demand: string; gap15: string; gap25: string; gap40: string }[];
  };
  found: number;
  totalLost: number;
  range: [string, string] | null;
};
type CR = {
  ok: boolean;
  reason?: string;
  years: number[];
  months: { month: number; label: string; index: number; belowIn: number; typical: number }[];
  averageMonth: number;
  crunch: { label: string; gap: number }[];
  crunchGap: number;
};
const DAY = 86400000;
const day = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** How often the gap score is right, measured on simulated shops it wasn't tuned on: misses and false alarms. */
function GapPerformance({ perf }: { perf: SO['performance'] }) {
  const cell = (v: string) => {
    const [a, b] = v.split('/').map(Number);
    const r = b ? a / b : 0;
    const c = r >= 0.8 ? 'var(--emerald)' : r >= 0.3 ? 'var(--amber)' : 'var(--faint)';
    return (
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-8 overflow-hidden rounded-full bg-[var(--line)]">
          <motion.span
            className="block h-full rounded-full"
            style={{ background: c }}
            initial={{ width: 0 }}
            whileInView={{ width: `${r * 100}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          />
        </span>
        <span className="mono text-[10.5px]">{v}</span>
      </span>
    );
  };
  return (
    <div className="mt-2.5 rounded-lg border p-2" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-1 text-[11.5px]">
        <span className="font-bold">Real gaps caught in testing</span>
        <span className="text-[var(--muted)]">
          false alarms: {perf.falseFlags.flagged} in {perf.falseFlags.histories.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 gap-y-0.5 text-[11px]">
        <span className="text-[var(--faint)]">demand</span>
        <span className="text-[var(--faint)]">15 days</span>
        <span className="text-[var(--faint)]">25 days</span>
        <span className="text-[var(--faint)]">40 days</span>
        {perf.detection.map((d) => (
          <Fragment key={d.demand}>
            <span className="truncate capitalize">{d.demand}</span>
            {cell(d.gap15)}
            {cell(d.gap25)}
            {cell(d.gap40)}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function StockCash() {
  const { version, dataset } = useStore();
  const soQ = useTool<SO>('stock-outs', { top: 200 }, [version]),
    crQ = useTool<CR>('cash-radar', {}, [version]);
  const [all, setAll] = useState(false);
  const so = soQ.data,
    cr = crQ.data;
  const err = soQ.error ?? crQ.error;
  if (err) return <ToolError message={err} retry={() => (soQ.error ? soQ.retry() : crQ.retry())} />;
  if (!so || !cr)
    return (
      <Loading
        steps={[
          'Finding trading days…',
          'Measuring each product’s usual pace…',
          'Testing every silence…',
          'Lining up the months…',
        ]}
      />
    );

  // The data's date range, to place each gap on a mini timeline.
  const [spanFrom, spanTo] = so.range ?? ['2000-01-01', '2000-01-02'];
  const t0 = spanFrom ? Date.parse(spanFrom) : 0,
    t1 = spanTo ? Date.parse(spanTo) : 1;
  const pos = (d: string) => Math.max(0, Math.min(100, ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * 100));
  const shown = all ? so.items : so.items.slice(0, 10);
  const drillFor = (i: SO['items'][number]) =>
    JSON.stringify({
      field: 'Product',
      values: [i.product],
      label: `${i.product} around its silent stretch`,
      rowType: 'sale',
      dateField: dataset?.fields.date ?? 'OrderDate',
      windows: [
        {
          label: '60 days either side of the gap',
          from: Date.parse(i.from) - 60 * DAY,
          to: Date.parse(i.to) + 61 * DAY,
        },
      ],
    });
  const crunchSet = new Set(cr.crunch.map((c) => c.label));

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-3 lg:grid-cols-12"
    >
      {/* Stock-outs headline */}
      <Card c="var(--orange)" className="lg:col-span-4" hover={false}>
        <CardHead
          icon={<PackageX size={13} />}
          title="Unusual sales gaps"
          c="var(--orange)"
          right={so.ok && <Chip c="var(--sky)">possible stock-outs</Chip>}
        />
        <div className="px-3.5 pb-3.5">
          {so.ok ? (
            <>
              <div className="flex items-baseline gap-2">
                <CountUp value={so.found} className="text-[30px] font-semibold" />
                <span className="text-[12px] text-[var(--muted)]">
                  of {so.scanned.toLocaleString()} regular products had an unusually long gap in orders, then
                  sold again
                </span>
                {so.items.length > 0 && (
                  <Confidence
                    sure={{
                      kind: 'heuristic',
                      note: `Held-out simulation: ${so.performance.falseFlags.flagged} false flag in ${so.performance.falseFlags.histories.toLocaleString()} product histories`,
                    }}
                    className="ml-auto"
                  />
                )}
              </div>
              <div className="text-[12px] text-[var(--muted)]">
                About{' '}
                <CountUp
                  value={so.totalLost}
                  format={(n) => usd(n)}
                  className="font-semibold text-[var(--text)]"
                />{' '}
                of sales not made during those gaps (rough estimate: usual daily sales × days).
              </div>
              {so.skippedNoOrderIds > 0 && (
                <div className="mt-1.5 text-[12px] text-[var(--muted)]">
                  {so.skippedNoOrderIds} product{so.skippedNoOrderIds === 1 ? '' : 's'} skipped: under 95% of
                  their sales carry an order number, so orders can’t be told from lines.
                </div>
              )}
              <GapPerformance perf={so.performance} />
              <div className="mt-2.5 text-[11.5px] leading-snug text-[var(--faint)]">{so.method}</div>
            </>
          ) : (
            <div className="text-[12px] text-[var(--muted)]">{so.reason}</div>
          )}
        </div>
      </Card>

      {/* Seasonal chart */}
      <Card c="var(--amber)" className="lg:col-span-8" hover={false}>
        <CardHead
          icon={<CalendarClock size={13} />}
          title="Seasonal sales dips"
          c="var(--amber)"
          right={
            cr.ok && (
              <Chip c="var(--faint)">
                {cr.years.length > 1 ? `${cr.years.length} full years` : 'one observed annual cycle'} · 1.0 =
                an average month
              </Chip>
            )
          }
        />
        {cr.ok ? (
          <div className="h-[170px] px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cr.months} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} width={36} tickFormatter={(v) => `${v.toFixed(1)}×`} />
                <Tooltip
                  cursor={{ fill: 'var(--line)' }}
                  content={<ChartTip fmt={(v: number) => `${v.toFixed(2)}× an average month`} />}
                />
                <ReferenceLine y={1} stroke="var(--line-strong)" strokeDasharray="3 3" />
                <Bar
                  dataKey="index"
                  name="Sales vs an average month"
                  radius={[5, 5, 2, 2]}
                  animationDuration={1100}
                >
                  {cr.months.map((m) => (
                    <Cell
                      key={m.label}
                      fill={
                        crunchSet.has(m.label)
                          ? 'var(--amber)'
                          : m.index >= 1
                            ? 'var(--emerald)'
                            : 'var(--sky)'
                      }
                      fillOpacity={crunchSet.has(m.label) ? 1 : 0.7}
                      style={
                        crunchSet.has(m.label) ? { filter: 'drop-shadow(0 0 5px var(--amber))' } : undefined
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="px-3.5 pb-3.5 text-[12px] text-[var(--muted)]">{cr.reason}</div>
        )}
      </Card>

      {/* Stock-out list */}
      <Card c="var(--orange)" className="lg:col-span-7" hover={false}>
        <CardHead
          icon={<PackageX size={13} />}
          title="Products with an unusual gap in orders"
          c="var(--orange)"
          right={<Chip c="var(--orange)">biggest miss first</Chip>}
        />
        <div className="px-3.5 pb-3">
          {!so.items.length && (
            <Empty icon={<PackageX size={20} />} title={so.ok ? 'No unusual gaps' : 'Not available'}>
              {so.ok ? 'Every regular product kept selling at its usual pace.' : so.reason}
            </Empty>
          )}
          {shown.map((i, k) => (
            <motion.button
              key={i.product}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.035 * k }}
              onClick={() => go('source', `?drill=${encodeURIComponent(drillFor(i))}`)}
              className="grid w-full grid-cols-[minmax(0,1.3fr)_1fr_auto] items-center gap-3 border-b py-1.5 text-left text-[12px] last:border-0 hover:bg-[var(--line)]"
              style={{ borderColor: 'var(--line)' }}
              title={`Sold ${i.rateBefore} times a trading day before, ${i.rateAfter} after. Gap score ${i.adjusted.toExponential(1)} after adjusting across products (heuristic; flagged below 0.01). Click to see the rows.`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{i.product}</span>
                <span className="block text-[11px] text-[var(--faint)]">
                  {i.tradingDays} trading days silent · {day(i.from)} – {day(i.to)}
                </span>
              </span>
              <span className="relative block h-2 rounded-full bg-[var(--line)]">
                <motion.span
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${pos(i.from)}%`,
                    background: 'var(--orange)',
                    boxShadow: '0 0 6px var(--orange)',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(1.2, pos(i.to) - pos(i.from))}%` }}
                  transition={{ duration: 0.6, delay: 0.1 + 0.035 * k }}
                />
              </span>
              <span className="flex items-center gap-1.5">
                <span className="mono font-semibold">{usd(i.lostSales, true)}</span>
                <Table2 size={12} className="text-[var(--muted)]" />
              </span>
            </motion.button>
          ))}
          {so.items.length > 10 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setAll(!all)}
              className="btn mt-2 !h-7 w-full justify-center text-[11.5px]"
            >
              {all ? 'Show the top 10' : `Show all ${so.items.length}`}
            </motion.button>
          )}
          <div className="mt-2 text-[11px] text-[var(--faint)]">
            Each gap is longer than this product’s usual order rate makes likely, even allowing for having
            searched its whole history. The file has no stock levels, so the cause is unknown: a stock-out, a
            delisting, a seasonal lull or a price change. The bar shows when it happened; click a row to see
            the sales around it.
          </div>
        </div>
      </Card>

      {/* Crunch months */}
      <Card c="var(--amber)" className="lg:col-span-5" hover={false}>
        <CardHead icon={<Wallet size={13} />} title="The slow months, in sales" c="var(--amber)" />
        <div className="px-3.5 pb-3.5">
          {cr.ok && cr.crunch.length ? (
            <>
              <div className="flex items-baseline gap-2">
                <CountUp
                  value={cr.crunchGap}
                  format={(n) => usd(n)}
                  className="grad-text text-[26px] font-semibold"
                />
                <span className="text-[12px] text-[var(--muted)]">
                  less revenue than {cr.crunch.length} average months
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {cr.crunch.map((c, i) => {
                  const m = cr.months.find((x) => x.label === c.label)!;
                  return (
                    <motion.div
                      key={c.label}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.07 }}
                      className="tint flex items-center gap-3 rounded-lg px-2.5 py-1.5"
                      style={{ '--c': 'var(--amber)' } as CSSProperties}
                    >
                      <span className="w-9 text-[13px] font-extrabold">{c.label}</span>
                      <span className="flex-1">
                        <span className="block h-1.5 rounded-full bg-[var(--line)]">
                          <motion.span
                            className="block h-1.5 rounded-full"
                            style={{ background: 'var(--amber)' }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, m.index * 100)}%` }}
                            transition={{ duration: 0.7, delay: 0.2 + i * 0.07 }}
                          />
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                          {Math.round(m.index * 100)}% of an average month · below average in {m.belowIn} of{' '}
                          {cr.years.length} years
                        </span>
                      </span>
                      <span className="mono text-[12px] font-semibold">−{usd(c.gap, true)}</span>
                    </motion.div>
                  );
                })}
              </div>
              <div className="mt-2.5 flex items-start gap-2 text-[12px] text-[var(--muted)]">
                <Info size={14} className="mt-0.5 flex-none" style={{ color: 'var(--sky)' }} />
                <span>
                  This is a revenue difference against an average month ({usd(cr.averageMonth)} at today’s
                  sales level), not a cash forecast: the file has no payment dates, supplier bills, payroll or
                  bank balance.
                  {cr.years.length < 2 && ' Based on one observed annual cycle, so it may not repeat.'}
                </span>
              </div>
              {cr.months.some((m) => m.index >= 1.15) && (
                <div className="mt-3">
                  <div className="label mb-1.5">The strongest months</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {cr.months
                      .filter((m) => m.index >= 1.15)
                      .sort((a, b) => b.index - a.index)
                      .slice(0, 3)
                      .map((m, i) => (
                        <motion.div
                          key={m.label}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 + i * 0.07 }}
                          className="tint rounded-lg px-2 py-1.5"
                          style={{ '--c': 'var(--emerald)' } as CSSProperties}
                        >
                          <div className="text-[11px] font-bold">{m.label}</div>
                          <div className="mono text-[13px] font-semibold" style={{ color: 'var(--emerald)' }}>
                            +{usd(m.typical - cr.averageMonth, true)}
                          </div>
                          <div className="text-[10.5px] text-[var(--faint)]">
                            {m.index.toFixed(2)}× average
                          </div>
                        </motion.div>
                      ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-[12px] text-[var(--muted)]">
              {cr.ok
                ? 'No month runs at least 15% below average in every year seen. Sales are fairly even through the year.'
                : cr.reason}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
