import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChevronDown,
  FlaskConical,
  Info,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserCheck,
  Recycle,
  Building2,
  MousePointerClick,
} from 'lucide-react';
import { tool, usd, pct } from '../api';
import { useStore } from '../store';
import { Card, CardHead, Chip, CountUp, Tabs, stagger, Loading } from '../components/ui';
import { ChartTip, axis } from '../components/charts';

type Levers = {
  churnReductionPct: number;
  conversionLiftPts: number;
  wasteReductionPct: number;
  opexReductionPct: number;
};
const LEVERS: {
  k: keyof Levers;
  label: string;
  hint: string;
  max: number;
  step: number;
  unit: string;
  c: string;
  icon: any;
}[] = [
  {
    k: 'churnReductionPct',
    label: 'Keep more customers',
    hint: 'Fewer customers stop buying from you each year',
    max: 30,
    step: 1,
    unit: '%',
    c: 'var(--violet)',
    icon: UserCheck,
  },
  {
    k: 'conversionLiftPts',
    label: 'Turn more visitors into buyers',
    hint: 'More of the people who visit your store place an order',
    max: 3,
    step: 0.1,
    unit: ' pts',
    c: 'var(--cyan)',
    icon: MousePointerClick,
  },
  {
    k: 'wasteReductionPct',
    label: 'Waste less stock',
    hint: 'Less inventory lost to damage, expiry or dead stock',
    max: 50,
    step: 1,
    unit: '%',
    c: 'var(--emerald)',
    icon: Recycle,
  },
  {
    k: 'opexReductionPct',
    label: 'Lower running costs',
    hint: 'Cut costs like software, rent and shipping',
    max: 20,
    step: 1,
    unit: '%',
    c: 'var(--amber)',
    icon: Building2,
  },
];
const PRESETS: Record<string, Levers> = {
  conservative: { churnReductionPct: 3, conversionLiftPts: 0.2, wasteReductionPct: 5, opexReductionPct: 3 },
  target: { churnReductionPct: 5, conversionLiftPts: 0.5, wasteReductionPct: 10, opexReductionPct: 8 },
  stretch: { churnReductionPct: 12, conversionLiftPts: 1, wasteReductionPct: 25, opexReductionPct: 12 },
};
const ASSUME = [
  { k: 'annualChurnRate', label: 'Customers lost per year', def: 0.2 },
  { k: 'baselineConversion', label: 'Visitors who buy today', def: 0.03 },
  { k: 'wasteRateOfCogs', label: 'Stock wasted (% of product cost)', def: 0.04 },
  { k: 'opexRateOfRevenue', label: 'Running costs (% of sales)', def: 0.12 },
  { k: 'assumedMargin', label: 'Gross margin to assume (used only without cost data)', def: 0.35 },
];

export default function Simulator() {
  const { actions, version } = useStore();
  const [preset, setPreset] = useState('target');
  const [lv, setLv] = useState<Levers>(PRESETS.target);
  const [as, setAs] = useState<Record<string, number>>(Object.fromEntries(ASSUME.map((a) => [a.k, a.def])));
  const [res, setRes] = useState<any>(null);
  const [openA, setOpenA] = useState(false),
    [openF, setOpenF] = useState(false);
  const t = useRef<number>();
  useEffect(() => {
    clearTimeout(t.current);
    t.current = window.setTimeout(
      () => tool('run-scenario', { levers: lv, assumptions: as }).then((r) => r.ok && setRes(r.data)),
      140,
    );
  }, [lv, as, version]);
  const pick = (p: string) => {
    setPreset(p);
    setLv(PRESETS[p]);
  };

  const wf = res
    ? (() => {
        const steps = [
          { name: 'Baseline', v: res.baseline.profit, kind: 'base' },
          { name: 'Churn', v: res.contributions.churn },
          { name: 'Conversion', v: res.contributions.conversion },
          { name: 'Waste', v: res.contributions.waste },
          { name: 'Opex', v: res.contributions.opex },
        ];
        let run = 0;
        const out = steps.map((s) => {
          const start = s.kind === 'base' ? 0 : run;
          run = s.kind === 'base' ? s.v : run + s.v;
          return { name: s.name, base: start, val: s.v, kind: s.kind ?? 'step' };
        });
        out.push({ name: 'Scenario', base: 0, val: res.scenario.profit, kind: 'total' });
        return out;
      })()
    : [];
  const wfColors: Record<string, string> = {
    Baseline: 'var(--faint)',
    Churn: 'var(--violet)',
    Conversion: 'var(--cyan)',
    Waste: 'var(--emerald)',
    Opex: 'var(--amber)',
    Scenario: 'var(--fuchsia)',
  };
  const topAction = actions.find((a) => a.expectedBenefitUsd);
  // Revenue-type benefits are converted to profit at baseline margin so they compare like for like with the profit uplift.
  const fixProfit =
    topAction?.expectedBenefitUsd && res
      ? topAction.benefitKind === 'revenue'
        ? topAction.expectedBenefitUsd * res.baseline.margin
        : topAction.expectedBenefitUsd
      : null;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-3 lg:grid-cols-12"
    >
      <Card c="var(--emerald)" className="lg:col-span-5" hover={false}>
        <CardHead
          icon={<SlidersHorizontal size={13} />}
          title="Levers"
          c="var(--emerald)"
          right={<Chip c="var(--amber)">Hypothetical</Chip>}
        />
        <div className="px-2">
          <Tabs
            layoutId="preset"
            value={preset}
            onChange={pick}
            tabs={[
              { id: 'conservative', label: 'Conservative', c: 'var(--cyan)' },
              { id: 'target', label: 'Target', c: 'var(--emerald)' },
              { id: 'stretch', label: 'Stretch', c: 'var(--fuchsia)' },
            ]}
          />
        </div>
        <div className="space-y-3.5 p-3.5">
          {LEVERS.map((l) => {
            const v = lv[l.k];
            return (
              <div key={l.k} style={{ '--c': l.c, '--p': `${(v / l.max) * 100}%` } as CSSProperties}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[12.5px] font-bold">
                    <span
                      className="grid h-5 w-5 place-items-center rounded-md"
                      style={{ color: l.c, background: `color-mix(in srgb, ${l.c} 16%, transparent)` }}
                    >
                      <l.icon size={12} />
                    </span>
                    {l.label}
                  </span>
                  <motion.span
                    key={v}
                    initial={{ scale: 1.25, color: l.c }}
                    animate={{ scale: 1, color: 'var(--text)' }}
                    className="mono text-[12.5px] font-semibold"
                  >
                    {l.step < 1 ? v.toFixed(1) : v}
                    {l.unit}
                  </motion.span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={l.max}
                  step={l.step}
                  value={v}
                  onChange={(e) => {
                    setPreset('custom');
                    setLv({ ...lv, [l.k]: Number(e.target.value) });
                  }}
                  aria-label={l.label}
                />
                <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">{l.hint}</div>
                {res && (
                  <div className="mt-0.5 text-[11.5px] text-[var(--faint)]">
                    adds{' '}
                    <span className="mono font-semibold" style={{ color: l.c }}>
                      {usd(
                        res.contributions[
                          {
                            churnReductionPct: 'churn',
                            conversionLiftPts: 'conversion',
                            wasteReductionPct: 'waste',
                            opexReductionPct: 'opex',
                          }[l.k]
                        ],
                      )}
                    </span>{' '}
                    profit
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setOpenA(!openA)}
          className="row-hover flex w-full items-center justify-between border-t px-3.5 py-2.5 text-[12px] font-bold"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="flex items-center gap-1.5">
            <FlaskConical size={13} style={{ color: 'var(--amber)' }} />
            Your numbers (edit to match your business)
          </span>
          <ChevronDown
            size={14}
            style={{ transform: openA ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
          />
        </button>
        <AnimatePresence initial={false}>
          {openA && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 px-3.5 pb-3.5">
                {ASSUME.map((a) => (
                  <label key={a.k} className="text-[11px] font-semibold text-[var(--muted)]">
                    {a.label}
                    <div className="relative mt-1">
                      <input
                        className="input mono w-full pr-6"
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={+(as[a.k] * 100).toFixed(2)}
                        onChange={(e) =>
                          setAs({ ...as, [a.k]: Math.max(0.01, Number(e.target.value)) / 100 })
                        }
                      />
                      <span className="absolute right-2 top-1.5 text-[var(--faint)]">%</span>
                    </div>
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <div className="grid gap-3 lg:col-span-7">
        <Card c="var(--fuchsia)" hover={false} className="p-4">
          {!res ? (
            <Loading steps={['Loading baseline…', 'Applying levers…', 'Computing profit…']} />
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[260px] flex-[1_1_320px]">
                <div className="label flex items-center gap-1">
                  <Sparkles size={11} style={{ color: 'var(--fuchsia)' }} />
                  Extra profit {res.baseline.basis === 'observed' ? 'over this period' : 'per year'}{' '}
                  (estimate)
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[30px] font-semibold" style={{ color: 'var(--emerald)' }}>
                    +
                  </span>
                  <CountUp
                    value={res.delta.profit}
                    format={(n) => usd(n)}
                    className="grad-text text-[34px] font-semibold tracking-tight"
                    duration={0.6}
                  />
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  {res.profitChangePct != null
                    ? `${pct(res.profitChangePct)} over ${res.baseline.basis === 'observed' ? '' : 'yearly '}profit ${usd(res.baseline.profit, true)}`
                    : `Profit estimated at an assumed ${Math.round(res.baseline.margin * 100)}% margin (no cost data)`}{' '}
                  · gross profit {usd(res.delta.grossProfit, true)} + running-cost savings{' '}
                  {usd(res.delta.opexSaving, true)}
                  {res.baseline.basis === 'run-rate' && (
                    <>
                      {' '}
                      ·{' '}
                      <span style={{ color: 'var(--amber)' }}>
                        run rate from{' '}
                        {res.baseline.years < 1
                          ? `${Math.round(res.baseline.years * 12)} months`
                          : 'part of a year'}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="grid min-w-[300px] flex-[1_1_340px] grid-cols-3 gap-2">
                {[
                  { l: 'Revenue', v: res.scenario.revenue, d: res.delta.revenue, c: 'var(--violet)' },
                  {
                    l: 'Gross profit',
                    v: res.scenario.grossProfit,
                    d: res.delta.grossProfit,
                    c: 'var(--emerald)',
                  },
                  {
                    l: 'Gross margin',
                    v: res.scenario.margin,
                    d: res.scenario.margin - res.baseline.margin,
                    c: 'var(--cyan)',
                    p: true,
                  },
                ].map((m) => (
                  <div key={m.l} className="tint rounded-lg p-2" style={{ '--c': m.c } as CSSProperties}>
                    <div className="label truncate">{m.l}</div>
                    <CountUp
                      value={m.v}
                      format={(n) => (m.p ? pct(n) : usd(n, true))}
                      className="text-[15px] font-semibold"
                      duration={0.6}
                    />
                    <div className="mono text-[11.5px]" style={{ color: m.c }}>
                      +{m.p ? `${(m.d * 100).toFixed(2)} pts` : usd(m.d, true)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card c="var(--violet)" hover={false}>
          <CardHead icon={<TrendingUp size={13} />} title="Profit bridge" c="var(--violet)" />
          <div className="h-[230px] px-1 pb-2">
            <ResponsiveContainer>
              <BarChart data={wf} margin={{ top: 18, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="name" {...axis} />
                <YAxis
                  {...axis}
                  width={50}
                  tickFormatter={(v) => usd(v, true)}
                  domain={[(min: number) => Math.max(0, Math.floor(min * 0.92)), 'auto']}
                />
                <Tooltip
                  content={<ChartTip fmt={(v, n) => (n === 'base' ? '' : usd(v))} />}
                  cursor={{ fill: 'var(--line)' }}
                />
                <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="val" stackId="a" name="Profit" radius={[5, 5, 0, 0]} isAnimationActive={false}>
                  {wf.map((d) => (
                    <Cell
                      key={d.name}
                      fill={wfColors[d.name]}
                      style={{
                        filter: d.kind === 'step' ? `drop-shadow(0 0 6px ${wfColors[d.name]})` : 'none',
                      }}
                    />
                  ))}
                  <LabelList
                    dataKey="val"
                    position="top"
                    formatter={(v: number) => usd(v, true)}
                    style={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          <Card c="var(--blue)" hover={false} className="p-3.5">
            <button
              onClick={() => setOpenF(!openF)}
              className="label flex w-full items-center justify-between"
            >
              <span className="flex items-center gap-1">
                <Sigma size={11} style={{ color: 'var(--blue)' }} />
                How we calculate this
              </span>
              <ChevronDown
                size={13}
                style={{ transform: openF ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
              />
            </button>
            {!openF && (
              <div className="mt-2 text-[11.5px] text-[var(--muted)]">
                Every number here comes from a simple, visible formula using your sales and the numbers you
                set. Nothing is guessed by AI.
              </div>
            )}
            <AnimatePresence initial={false}>
              {openF && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 space-y-1.5 overflow-hidden"
                >
                  {res?.formulas.map((f: string) => (
                    <div
                      key={f}
                      className="mono rounded-md px-2 py-1 text-[11.5px] leading-relaxed"
                      style={{ background: 'var(--line)' }}
                    >
                      {f}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
          <Card c="var(--amber)" hover={false} className="p-3.5">
            <div className="label mb-2 flex items-center gap-1">
              <Info size={11} style={{ color: 'var(--amber)' }} />
              Compare with a fix
            </div>
            {topAction ? (
              <>
                <div className="text-[12.5px] font-bold">{topAction.intervention}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="mono text-[18px] font-semibold" style={{ color: 'var(--emerald)' }}>
                    {usd(topAction.expectedBenefitUsd)}
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">
                    {topAction.benefitKind} · {topAction.effort} effort
                  </span>
                </div>
                <div className="mt-1 text-[11.5px] text-[var(--faint)]">{topAction.benefitBasis}</div>
                {fixProfit !== null && (
                  <div className="mt-2 text-[11px] text-[var(--muted)]">
                    ≈ <span className="mono font-semibold text-[var(--text)]">{usd(fixProfit)}</span> profit
                    {topAction.benefitKind === 'revenue' ? ' at baseline margin' : ''}, or{' '}
                    <span className="mono font-semibold text-[var(--text)]">
                      {Math.round((fixProfit / Math.max(1, res.delta.profit)) * 100)}%
                    </span>{' '}
                    of this scenario's uplift.
                  </div>
                )}
              </>
            ) : (
              <div className="text-[12px] text-[var(--faint)]">No quantified action for this data.</div>
            )}
          </Card>
        </div>
        <div className="text-[11.5px] text-[var(--faint)]">{res?.disclaimer}</div>
      </div>
    </motion.div>
  );
}
