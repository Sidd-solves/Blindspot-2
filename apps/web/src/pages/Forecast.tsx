import { motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Check, CircleDashed, History, LineChart, Minus, ShieldCheck, Target, Trophy, X } from 'lucide-react';
import { tool, usd } from '../api';
import { useStore } from '../store';
import { Card, CardHead, Chip, CountUp, Empty, Loading, Ring, stagger } from '../components/ui';
import { ChartTip, axis, glowDefs } from '../components/charts';
import { Confidence } from '../components/Confidence';

type F = {
  ok: boolean;
  reason?: string;
  measure: string;
  history: { month: string; value: number }[];
  partialMonth: string | null;
  method: { id: string; label: string; how: string } | null;
  methods: { id: string; label: string; how: string; wape: number | null; months: number }[];
  backtest: {
    month: string;
    actual: number;
    predicted: number;
    method: string;
    error: number | null;
    low: number | null;
    high: number | null;
    inside: boolean | null;
  }[];
  accuracy: {
    wape: number | null;
    months: number;
    hitRate: number | null;
    rangeTested: number;
    bias: number | null;
  };
  forecast: { month: string; value: number; low: number; high: number }[];
  coverage: number;
  notes: string[];
};

const METHOD_C: Record<string, string> = {
  'last-month': 'var(--blue)',
  'three-month-average': 'var(--violet)',
  'same-month-last-year': 'var(--cyan)',
  'last-year-plus-trend': 'var(--fuchsia)',
};
const monthName = (m: string, short = false) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric',
    timeZone: 'UTC',
  });
/** Miss size colors: small is good, large is a warning. Red is reserved for errors, so misses top out at orange. */
const missColor = (e: number | null) =>
  e === null
    ? 'var(--faint)'
    : Math.abs(e) < 0.1
      ? 'var(--emerald)'
      : Math.abs(e) < 0.25
        ? 'var(--amber)'
        : 'var(--orange)';
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function Forecast() {
  const { version } = useStore();
  const [f, setF] = useState<F | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    setF(null);
    tool('forecast-sales', { horizon: 3 }).then((r) => r.ok && setF(r.data));
  }, [version]);

  if (!f)
    return (
      <Loading
        steps={[
          'Adding up sales by month…',
          'Replaying four methods on past months…',
          'Measuring past misses…',
          'Forecasting the next 3 months…',
        ]}
      />
    );
  if (!f.ok)
    return (
      <Card hover={false} className="p-6">
        <Empty icon={<CircleDashed size={22} />} title="Not enough history to forecast honestly">
          {f.reason} A forecast is only shown when it can first be checked against months that already
          happened.
        </Empty>
      </Card>
    );

  const next = f.forecast[0];
  const acc = f.accuracy;
  const hits = acc.rangeTested ? Math.round((acc.hitRate ?? 0) * acc.rangeTested) : 0;
  const best = Math.min(...f.methods.filter((m) => m.wape !== null).map((m) => m.wape as number));
  const worst = Math.max(...f.methods.filter((m) => m.wape !== null).map((m) => m.wape as number));

  // One timeline: actual sales, what the forecast said at the time, and the next months with their ranges.
  const bt = new Map(f.backtest.map((b) => [b.month, b]));
  const last = f.history[f.history.length - 1];
  const data = [
    ...f.history.map((h) => {
      const b = bt.get(h.month);
      return {
        m: monthName(h.month, true),
        actual: h.value,
        said: b?.predicted ?? null,
        range: b && b.low !== null && b.high !== null ? [b.low, b.high] : null,
      };
    }),
    ...f.forecast.map((x) => ({
      m: monthName(x.month, true),
      actual: null,
      // Join the forecast line to the last actual month so it reads as a continuation.
      ahead: x.value,
      range: [x.low, x.high],
    })),
  ];
  const joinAt = data.findIndex((d) => d.m === monthName(last.month, true));
  if (joinAt >= 0) (data[joinAt] as any).ahead = last.value;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-3 lg:grid-cols-12"
    >
      {/* Next month: the headline */}
      <Card c="var(--cyan)" className="lg:col-span-5" hover={false}>
        <CardHead
          icon={<LineChart size={13} />}
          title={`${f.measure} forecast`}
          c="var(--cyan)"
          right={
            <Chip c={METHOD_C[f.method!.id] ?? 'var(--cyan)'} pulse>
              {f.method!.label}
            </Chip>
          }
        />
        <div className="px-3.5 pb-3.5">
          <div className="label">{monthName(next.month)}</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <CountUp
              value={next.value}
              format={(n) => usd(n)}
              className="grad-text text-[30px] font-semibold"
            />
            <Confidence
              sure={{
                kind: 'forecast',
                note: `Replayed on ${acc.months} past months: ${((acc.wape ?? 0) * 100).toFixed(1)}% average miss`,
              }}
            />
          </div>
          <div className="text-[12px] text-[var(--muted)]">
            likely <span className="mono font-semibold text-[var(--text)]">{usd(next.low)}</span> to{' '}
            <span className="mono font-semibold text-[var(--text)]">{usd(next.high)}</span> (80% range from
            past misses)
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {f.forecast.map((x, i) => {
              const top = Math.max(...f.forecast.map((y) => y.high)) || 1;
              return (
                <motion.div
                  key={x.month}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  className="tint rounded-lg p-2"
                  style={{ '--c': 'var(--cyan)' } as CSSProperties}
                >
                  <div className="text-[11px] font-bold text-[var(--muted)]">{monthName(x.month, true)}</div>
                  <div className="mono text-[13.5px] font-semibold">{usd(x.value, true)}</div>
                  <div className="relative mt-1.5 h-1.5 rounded-full bg-[var(--line)]">
                    <motion.div
                      className="absolute h-1.5 rounded-full"
                      style={{ background: 'linear-gradient(90deg, var(--cyan), var(--violet))' }}
                      initial={{ left: `${(x.value / top) * 100}%`, width: 0 }}
                      animate={{
                        left: `${(x.low / top) * 100}%`,
                        width: `${((x.high - x.low) / top) * 100}%`,
                      }}
                      transition={{ duration: 0.9, delay: 0.25 + i * 0.08 }}
                    />
                  </div>
                  <div className="mt-1 text-[10.5px] text-[var(--faint)]">
                    {usd(x.low, true)}–{usd(x.high, true)}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Track record */}
      <Card c="var(--emerald)" className="lg:col-span-3" hover={false}>
        <CardHead icon={<ShieldCheck size={13} />} title="Track record" c="var(--emerald)" />
        <div className="flex items-center gap-3 px-3.5 pb-2">
          <div className="flex-none">
            <Ring value={1 - (acc.wape ?? 1)} size={84} c="var(--emerald)">
              <div>
                <div className="mono text-[15px] font-semibold">{pct1(acc.wape ?? 0)}</div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--faint)]">
                  avg miss
                </div>
              </div>
            </Ring>
          </div>
          <div className="min-w-0 text-[12px] leading-snug text-[var(--muted)]">
            Replayed on the last <b className="text-[var(--text)]">{acc.months} months</b>, using only the
            data that existed at the time.
          </div>
        </div>
        <div className="px-3.5 pb-3.5">
          <div className="mb-1 flex items-center justify-between text-[11.5px]">
            <span className="font-bold">Inside the range</span>
            <span className="mono text-[var(--muted)]">
              {hits} of {acc.rangeTested} · aim 80%
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {f.backtest.map((b, i) => (
              <motion.span
                key={b.month}
                title={`${monthName(b.month)}: ${b.inside === null ? 'no range yet' : b.inside ? 'inside the range' : 'outside the range'}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 + i * 0.04, type: 'spring', stiffness: 400, damping: 18 }}
                className="grid h-5 w-5 place-items-center rounded-md"
                style={{
                  background: `color-mix(in srgb, ${b.inside === null ? 'var(--faint)' : b.inside ? 'var(--emerald)' : 'var(--amber)'} 20%, transparent)`,
                  color: b.inside === null ? 'var(--faint)' : b.inside ? 'var(--emerald)' : 'var(--amber)',
                }}
              >
                {b.inside === null ? <Minus size={11} /> : b.inside ? <Check size={11} /> : <X size={11} />}
              </motion.span>
            ))}
          </div>
          {acc.bias !== null && Math.abs(acc.bias) >= 0.02 && (
            <div className="mt-2 text-[11.5px] text-[var(--muted)]">
              Past forecasts ran <b className="text-[var(--text)]">{pct1(Math.abs(acc.bias))}</b>{' '}
              {acc.bias > 0 ? 'low' : 'high'} on average.
            </div>
          )}
        </div>
      </Card>

      {/* Methods compared */}
      <Card c="var(--violet)" className="lg:col-span-4" hover={false}>
        <CardHead icon={<Trophy size={13} />} title="Four methods, same test" c="var(--violet)" />
        <div className="space-y-2 px-3.5 pb-3">
          {f.methods.map((m, i) => {
            const used = m.id === f.method!.id,
              c = METHOD_C[m.id];
            return (
              <div key={m.id} title={m.how}>
                <div className="mb-0.5 flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                    {m.label}
                    {used && <Chip c={c}>Used now</Chip>}
                  </span>
                  <span className="mono text-[var(--muted)]">
                    {m.wape === null ? 'needs more history' : `${pct1(m.wape)} miss`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--line)]">
                  <motion.div
                    className="h-1.5 rounded-full"
                    style={{
                      background: c,
                      boxShadow: used ? `0 0 8px ${c}` : undefined,
                      opacity: used ? 1 : 0.6,
                    }}
                    initial={{ width: 0 }}
                    animate={{
                      width:
                        m.wape === null
                          ? '0%'
                          : `${Math.max(6, (1 - ((m.wape - best) / (worst - best || 1)) * 0.85) * 100)}%`,
                    }}
                    transition={{ duration: 0.8, delay: 0.2 + i * 0.07 }}
                  />
                </div>
              </div>
            );
          })}
          <div className="pt-1 text-[11px] leading-snug text-[var(--faint)]">
            Longer bar = smaller miss. The method is picked again each month from its errors before that
            month, never with hindsight.
          </div>
        </div>
      </Card>

      {/* The chart */}
      <Card c="var(--fuchsia)" className="lg:col-span-12" hover={false}>
        <CardHead
          icon={<Target size={13} />}
          title="What it said vs what happened"
          c="var(--fuchsia)"
          right={
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-4 rounded" style={{ background: 'var(--violet)' }} />
                Actual
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="h-0.5 w-4 rounded border-t-2 border-dashed"
                  style={{ borderColor: 'var(--amber)' }}
                />
                What it said at the time
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="h-0.5 w-4 rounded border-t-2 border-dashed"
                  style={{ borderColor: 'var(--cyan)' }}
                />
                Next months
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="h-2.5 w-4 rounded"
                  style={{ background: 'color-mix(in srgb, var(--cyan) 22%, transparent)' }}
                />
                80% range
              </span>
            </div>
          }
        />
        <div className="h-[270px] px-2 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              {glowDefs('fc', 'var(--violet)')}
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="m" {...axis} interval="preserveStartEnd" minTickGap={18} />
              <YAxis {...axis} width={52} tickFormatter={(v) => usd(v, true)} />
              <Tooltip
                content={
                  <ChartTip
                    fmt={(v: any) => (Array.isArray(v) ? `${usd(v[0], true)}–${usd(v[1], true)}` : usd(v))}
                  />
                }
              />
              <Area
                dataKey="range"
                name="80% range"
                stroke="none"
                fill="var(--cyan)"
                fillOpacity={0.16}
                connectNulls={false}
                isAnimationActive
                animationDuration={1200}
              />
              <Area
                dataKey="actual"
                name="Actual"
                stroke="url(#fc-stroke)"
                strokeWidth={2.4}
                fill="url(#fc-fill)"
                filter="url(#fc-glow)"
                dot={false}
                animationDuration={1400}
              />
              <Line
                dataKey="said"
                name="Said at the time"
                stroke="var(--amber)"
                strokeWidth={1.8}
                strokeDasharray="5 4"
                dot={{ r: 2.6, fill: 'var(--amber)', strokeWidth: 0 }}
                connectNulls={false}
                animationDuration={1600}
              />
              <Line
                dataKey="ahead"
                name="Forecast"
                stroke="var(--cyan)"
                strokeWidth={2.2}
                strokeDasharray="6 4"
                dot={{ r: 3, fill: 'var(--cyan)', strokeWidth: 0 }}
                connectNulls
                animationDuration={1800}
              />
              <ReferenceLine
                x={monthName(last.month, true)}
                stroke="var(--line-strong)"
                strokeDasharray="3 3"
                label={{
                  value: 'last full month',
                  position: 'insideTopRight',
                  fill: 'var(--faint)',
                  fontSize: 10,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Month by month */}
      <Card c="var(--amber)" className="lg:col-span-7" hover={false}>
        <CardHead
          icon={<History size={13} />}
          title="Every past test month"
          c="var(--amber)"
          right={<Chip c="var(--emerald)">No peeking at the future</Chip>}
        />
        <div className="px-3.5 pb-3">
          <div
            className="grid grid-cols-[1fr_1fr_1fr_1.2fr_auto] gap-x-3 border-b pb-1 text-[10.5px] font-bold uppercase tracking-wider text-[var(--faint)]"
            style={{ borderColor: 'var(--line)' }}
          >
            <span>Month</span>
            <span className="text-right">Said</span>
            <span className="text-right">Actual</span>
            <span>Miss</span>
            <span />
          </div>
          {[...f.backtest]
            .reverse()
            .slice(0, all ? undefined : 6)
            .map((b, i) => (
              <motion.div
                key={b.month}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 + i * 0.03 }}
                className="grid grid-cols-[1fr_1fr_1fr_1.2fr_auto] items-center gap-x-3 border-b py-1 text-[12px] last:border-0 hover:bg-[var(--line)]"
                style={{ borderColor: 'var(--line)' }}
                title={f.methods.find((m) => m.id === b.method)?.label}
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: METHOD_C[b.method] }} />
                  {monthName(b.month, true)}
                </span>
                <span className="mono text-right text-[var(--muted)]">{usd(b.predicted, true)}</span>
                <span className="mono text-right">{usd(b.actual, true)}</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 flex-1 rounded-full bg-[var(--line)]">
                    <motion.span
                      className="block h-1.5 rounded-full"
                      style={{ background: missColor(b.error) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.abs(b.error ?? 0) * 250)}%` }}
                      transition={{ duration: 0.6, delay: 0.1 + i * 0.03 }}
                    />
                  </span>
                  <span className="mono w-12 text-right text-[11.5px]" style={{ color: missColor(b.error) }}>
                    {b.error === null ? '—' : `${b.error > 0 ? '+' : ''}${(b.error * 100).toFixed(0)}%`}
                  </span>
                </span>
                <span
                  style={{
                    color: b.inside === null ? 'var(--faint)' : b.inside ? 'var(--emerald)' : 'var(--amber)',
                  }}
                >
                  {b.inside === null ? <Minus size={12} /> : b.inside ? <Check size={12} /> : <X size={12} />}
                </span>
              </motion.div>
            ))}
          {f.backtest.length > 6 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setAll(!all)}
              className="btn mt-2 !h-7 w-full justify-center text-[11.5px]"
            >
              {all ? 'Show the latest 6' : `Show all ${f.backtest.length} test months`}
            </motion.button>
          )}
        </div>
      </Card>

      {/* How it works */}
      <Card c="var(--blue)" className="lg:col-span-5" hover={false}>
        <CardHead icon={<ShieldCheck size={13} />} title="Why you can trust this number" c="var(--blue)" />
        <ol className="space-y-2 px-3.5 pb-3.5 text-[12px] leading-snug">
          {[
            [
              'Replayed, not claimed',
              `Each of the last ${acc.months} months was forecast using only the months before it, then compared with what really happened.`,
            ],
            [
              'Picked without hindsight',
              'Four simple methods compete. At every month, the one with the smallest past misses so far is used, so the score above is for the whole process.',
            ],
            [
              'A range from real misses',
              `The 80% range comes from how far off the forecasts actually were, and it widens further ahead and when there are only a few months to learn from.`,
            ],
            [
              'Honest limits',
              'It assumes the coming months behave like the past ones. A promotion, stock-out or price change will move it.',
            ],
          ].map(([t, d], i) => (
            <motion.li
              key={t}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07 }}
              className="flex gap-2"
            >
              <span
                className="mono grid h-5 w-5 flex-none place-items-center rounded-md text-[11px] font-bold"
                style={{
                  color: 'var(--blue)',
                  background: 'color-mix(in srgb, var(--blue) 15%, transparent)',
                }}
              >
                {i + 1}
              </span>
              <span>
                <b>{t}.</b> <span className="text-[var(--muted)]">{d}</span>
              </span>
            </motion.li>
          ))}
          {f.notes.map((n) => (
            <li key={n} className="text-[11.5px] text-[var(--faint)]">
              {n}
            </li>
          ))}
        </ol>
      </Card>
    </motion.div>
  );
}
