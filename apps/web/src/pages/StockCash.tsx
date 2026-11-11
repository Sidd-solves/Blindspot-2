import { motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, PackageX, PiggyBank, Table2, Wallet } from 'lucide-react';
import { tool, usd } from '../api';
import { useStore } from '../store';
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
    p: number;
    q: number;
    lostSales: number;
  }[];
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
const fmtQ = (q: number) => (q < 0.001 ? 'q < 0.001' : `q = ${q.toFixed(3)}`);

export default function StockCash() {
  const { version, dataset } = useStore();
  const [so, setSo] = useState<SO | null>(null),
    [cr, setCr] = useState<CR | null>(null),
    [all, setAll] = useState(false);
  useEffect(() => {
    setSo(null);
    setCr(null);
    tool('stock-outs', { top: 200 }).then((r) => r.ok && setSo(r.data));
    tool('cash-radar', {}).then((r) => r.ok && setCr(r.data));
  }, [version]);
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
          title="Likely stock-outs"
          c="var(--orange)"
          right={so.ok && <Chip c="var(--emerald)">tested · q &lt; 0.01</Chip>}
        />
        <div className="px-3.5 pb-3.5">
          {so.ok ? (
            <>
              <div className="flex items-baseline gap-2">
                <CountUp value={so.found} className="text-[30px] font-semibold" />
                <span className="text-[12px] text-[var(--muted)]">
                  of {so.scanned.toLocaleString()} regular products went silent, then came back
                </span>
                {so.items.length > 0 && (
                  <Confidence
                    sure={{ kind: 'tested', p: Math.max(...so.items.map((x) => x.q)), pKind: 'q' }}
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
                of sales missed while they were silent (estimate).
              </div>
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
          title="Which months run short"
          c="var(--amber)"
          right={
            cr.ok && (
              <Chip c="var(--faint)">
                {cr.years.length} full year{cr.years.length > 1 ? 's' : ''} · 1.0 = an average month
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
          title="Products that went silent, then sold again"
          c="var(--orange)"
          right={<Chip c="var(--orange)">biggest miss first</Chip>}
        />
        <div className="px-3.5 pb-3">
          {!so.items.length && (
            <Empty icon={<PackageX size={20} />} title={so.ok ? 'No unusual silences' : 'Not available'}>
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
              title={`Sold ${i.rateBefore} times a trading day before, ${i.rateAfter} after. Chance of this silence by luck: p = ${i.p.toExponential(1)} (${fmtQ(i.q)}). Click to see the rows.`}
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
            Without stock levels in the file, these are likely stock-outs, not confirmed ones. The bar shows
            when each silence happened. Click a row to see its sales before, during and after.
          </div>
        </div>
      </Card>

      {/* Crunch months */}
      <Card c="var(--amber)" className="lg:col-span-5" hover={false}>
        <CardHead icon={<Wallet size={13} />} title="Plan for the slow months" c="var(--amber)" />
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
                  less than {cr.crunch.length} average months bring in
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
                <PiggyBank size={14} className="mt-0.5 flex-none" style={{ color: 'var(--emerald)' }} />
                <span>
                  An average month is <b className="text-[var(--text)]">{usd(cr.averageMonth)}</b> at today’s
                  sales level. Setting aside the gap in the busy months before keeps the slow ones covered.
                </span>
              </div>
              {cr.months.some((m) => m.index >= 1.15) && (
                <div className="mt-3">
                  <div className="label mb-1.5">Where the cushion comes from</div>
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
                ? 'No month runs at least 15% below average every year. Cash flow is fairly even.'
                : cr.reason}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
