import { motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowRight,
  Check,
  Crosshair,
  DollarSign,
  FlaskConical,
  Gauge,
  Layers,
  LineChart,
  Lightbulb,
  PieChart,
  Radar,
  ShoppingCart,
  TrendingUp,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { pct, SEV, CAT, tool, usd, evidenceText, VERDICT, exposureText, impactColor } from '../api';
import { Card, CardHead, Chip, CountUp, Meter, Ring, Sparkline, stagger, Loading } from '../components/ui';
import { ChartTip, axis, glowDefs } from '../components/charts';
import { go } from '../App';
import { Confidence, sureOf } from '../components/Confidence';

const KPI_STYLE = [
  { c: 'var(--violet)', icon: DollarSign },
  { c: 'var(--emerald)', icon: TrendingUp },
  { c: 'var(--cyan)', icon: Gauge },
  { c: 'var(--amber)', icon: ShoppingCart },
];

/** Layer 2 on the front page: what moved revenue, compared with the same period last year when possible. */
function DriversCard() {
  const { version } = useStore();
  const [d, setD] = useState<any>(null),
    [err, setErr] = useState('');
  useEffect(() => {
    tool('explain-change').then((r) => (r.ok ? setD(r.data) : setErr(r.error!.message)));
  }, [version]);
  const drags = d
    ? (d.byDimension as any[])
        .filter((x) => !/^order/i.test(x.dimension))
        .flatMap((x) => x.drags.slice(0, 2).map((g: any) => ({ ...g, dim: x.dimension })))
        .sort((a: any, b: any) => a.delta - b.delta)
        .slice(0, 5)
    : [];
  const max = Math.max(1, ...drags.map((g: any) => Math.abs(g.delta)));
  return (
    <Card c="var(--cyan)" className="md:col-span-3 xl:col-span-4">
      <CardHead
        icon={<Layers size={13} />}
        title="What's driving the change"
        c="var(--cyan)"
        right={
          d && (
            <Chip c={d.changePct >= 0 ? 'var(--emerald)' : 'var(--rose)'}>
              {d.changePct >= 0 ? '▲' : '▼'} {pct(Math.abs(d.changePct))}
            </Chip>
          )
        }
      />
      <div className="px-3.5 pb-3">
        {err && <div className="text-[11.5px] text-[var(--faint)]">{err}</div>}
        {!d && !err && <div className="skeleton h-32" />}
        {d && (
          <>
            <div className="text-[11.5px] text-[var(--faint)]">{d.windows.label}</div>
            {d.decomposition && (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="tint rounded-md px-2 py-1" style={{ '--c': 'var(--cyan)' } as CSSProperties}>
                  <div className="label">Orders</div>
                  <span className="mono">
                    {d.decomposition.orders[0].toLocaleString()} →{' '}
                    {d.decomposition.orders[1].toLocaleString()}
                  </span>
                </div>
                <div
                  className="tint rounded-md px-2 py-1"
                  style={{ '--c': 'var(--violet)' } as CSSProperties}
                >
                  <div className="label">Avg order</div>
                  <span className="mono">
                    {usd(d.decomposition.aov[0])} → {usd(d.decomposition.aov[1])}
                  </span>
                </div>
              </div>
            )}
            <div className="label mt-2 mb-1">Biggest drags</div>
            <div className="space-y-1">
              {drags.map((g: any, i: number) => (
                <motion.div
                  key={g.dim + g.segment}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="text-[11px]"
                  title={`${g.dim}: ${g.segment}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="truncate">
                      <span className="text-[var(--faint)]">{g.dim} · </span>
                      <span className="font-semibold">{g.segment}</span>
                    </span>
                    <span className="mono flex-none" style={{ color: 'var(--rose)' }}>
                      {usd(g.delta, true)}
                    </span>
                  </div>
                  <Meter value={Math.abs(g.delta) / max} c="var(--rose)" h={3} />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/** Layer 3 on the front page: the strongest ideas the math supports (built-in library only, so it's free). */
function IdeasCard() {
  const { version } = useStore();
  const [res, setRes] = useState<any[] | null>(null),
    [openIdea, setOpenIdea] = useState<string | null>(null);
  useEffect(() => {
    setRes(null);
    tool('test-hypotheses', { useAI: false }).then((r) => setRes(r.ok ? r.data.results : []));
  }, [version]);
  const shown = (res ?? []).filter((h) => h.verdict !== 'inconclusive').slice(0, 4);
  return (
    <Card c="var(--fuchsia)" className="md:col-span-6 xl:col-span-4">
      <CardHead
        icon={<FlaskConical size={13} />}
        title="Ideas checked by math"
        c="var(--fuchsia)"
        right={
          <button className="btn !h-6 !px-2 text-[11px]" onClick={() => go('analyst')}>
            All
            <ArrowRight size={11} />
          </button>
        }
      />
      <div className="space-y-1.5 px-3 pb-3">
        {!res && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-9" />
            ))}
          </div>
        )}
        {res && shown.length === 0 && (
          <div className="text-[12px] text-[var(--muted)]">
            None of the built-in ideas apply to this data.
          </div>
        )}
        {shown.map((h, i) => (
          <motion.button
            type="button"
            key={h.id}
            layout
            aria-expanded={openIdea === h.id}
            aria-label={`${h.claim}: ${openIdea === h.id ? 'hide' : 'show'} full result`}
            onClick={() => setOpenIdea(openIdea === h.id ? null : h.id)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="block w-full cursor-pointer rounded-lg px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
            style={{ background: 'var(--line)', borderLeft: `3px solid ${VERDICT[h.verdict]?.c}` }}
          >
            <div
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: VERDICT[h.verdict]?.c }}
            >
              {h.verdict === 'supported' ? <Check size={11} /> : <X size={11} />}
              {VERDICT[h.verdict]?.label}
            </div>
            <div className="text-[11.5px] font-bold leading-snug">{h.claim}</div>
            <div
              className={`${openIdea === h.id ? '' : 'line-clamp-2'} text-[12px] leading-snug text-[var(--muted)]`}
            >
              {h.summary}
            </div>
            {openIdea !== h.id && h.summary.length > 110 && (
              <div
                className="mt-0.5 text-[11px] font-bold"
                style={{ color: VERDICT[h.verdict]?.c }}
                aria-hidden
              >
                Show all
              </div>
            )}
          </motion.button>
        ))}
      </div>
    </Card>
  );
}

export default function Overview() {
  const { dash, findings, bySeverity, actions, dataset, loading, version } = useStore();
  const [conc, setConc] = useState<any>(null),
    [concState, setConcState] = useState<'loading' | 'none' | 'ok'>('loading');
  const [fc, setFc] = useState<any>(null);
  useEffect(() => {
    setFc(null);
    tool('forecast-sales', { horizon: 1 }).then((r) => setFc(r.ok && r.data.ok ? r.data : null));
  }, [version]);
  useEffect(() => {
    if (!dataset) return;
    // Find customer/product columns by meaning, not by how many distinct values they have (a small shop may have 6 customers).
    const all = [...dataset.fields.highCardDims, ...dataset.fields.dims];
    const dim2 =
      all.find((d) => /customer|client|account|buyer/i.test(d)) ??
      all.find((d) => /product|item|sku|title/i.test(d)) ??
      dataset.fields.highCardDims.find(
        (d) => !/^(order|invoice)/i.test(d) && !/country|region|state/i.test(d),
      );
    if (dim2) {
      setConcState('loading');
      tool('interpret-concentration', { dimension: dim2, limit: 12 }).then((r) => {
        setConc(r.ok ? r.data : null);
        setConcState(r.ok ? 'ok' : 'none');
      });
    } else {
      setConc(null);
      setConcState('none');
    }
  }, [version]);

  if (!dash)
    return (
      <Loading steps={['Loading dataset…', 'Profiling columns…', 'Detecting risks…', 'Ranking findings…']} />
    );
  const trend = dash.charts.find((c) => c.type === 'line')?.data ?? [];
  const seg = dash.charts.find((c) => c.type === 'bar');
  // An unfinished last month is excluded from the comparison (it would look like a fake drop).
  const series = trend.filter((d: any) => !d.partial).map((d: any) => d.y);
  const partialMonth = trend.find((d: any) => d.partial)?.x;
  // With 18+ months, compare against the same months last year so seasonality doesn't fake growth.
  const yoy = series.length >= 18;
  const recentSum = series.slice(-6).reduce((a: number, b: number) => a + b, 0),
    priorSum = (yoy ? series.slice(-18, -12) : series.slice(-12, -6)).reduce(
      (a: number, b: number) => a + b,
      0,
    );
  const momentum = priorSum ? (recentSum - priorSum) / priorSum : 0;
  // Health: start at 100 and subtract per problem (critical 20, high 10, medium 5, low 1), scaled by how well-proven it is.
  const PENALTY: Record<string, number> = { critical: 20, high: 10, medium: 5, low: 1 };
  const health = Math.max(
    0,
    Math.round(100 - findings.reduce((s, f) => s + (PENALTY[f.severity] ?? 1) * f.confidence, 0)),
  );
  const band =
    health >= 80
      ? { label: 'Healthy', c: 'var(--emerald)', advice: 'Keep an eye on the few items below.' }
      : health >= 60
        ? { label: 'Fair', c: 'var(--cyan)', advice: 'A few problems are worth fixing soon.' }
        : health >= 40
          ? {
              label: 'Needs attention',
              c: 'var(--amber)',
              advice: 'Several problems are costing you money; start with the one below.',
            }
          : {
              label: 'At risk',
              c: 'var(--rose)',
              advice: 'Serious problems are costing you money; fix the one below this week.',
            };
  const top = findings[0];
  const fmt = (k: { format: string; value: number }) =>
    k.format === 'usd'
      ? (n: number) => usd(n, k.value >= 10000)
      : k.format === 'pct'
        ? (n: number) => pct(n)
        : (n: number) => Math.round(n).toLocaleString();

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-3 md:grid-cols-6 xl:grid-cols-12"
    >
      {dash.kpis.slice(0, 4).map((k, i) => {
        const st = KPI_STYLE[i];
        const spark = k.format === 'pct' ? [] : k.label === 'Orders' ? [] : series;
        return (
          <Card key={k.label} c={st.c} className="p-3 md:col-span-3 xl:col-span-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="label flex items-center gap-1">
                  <st.icon size={11} style={{ color: st.c }} />
                  {k.label}
                </div>
                <CountUp
                  value={k.value}
                  format={fmt(k)}
                  className="mt-1 block text-[22px] font-semibold tracking-tight"
                />
              </div>
              {spark.length > 1 ? (
                <Sparkline data={spark.slice(-12)} c={st.c} />
              ) : k.format === 'pct' ? (
                <Ring value={Math.max(0, k.value) * 4} size={42} stroke={5} c={st.c}>
                  <span className="mono text-[11px]">{pct(k.value, 0)}</span>
                </Ring>
              ) : (
                <div className="flex items-end gap-[3px]">
                  {series.slice(-10).map((v: number, j: number) => (
                    <motion.span
                      key={j}
                      className="w-[5px] rounded-sm"
                      style={{ background: st.c, opacity: 0.35 + j / 16 }}
                      initial={{ height: 0 }}
                      animate={{ height: 6 + (v / Math.max(...series)) * 20 }}
                      transition={{ delay: j * 0.04 }}
                    />
                  ))}
                </div>
              )}
            </div>
            {i === 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                <Chip c={momentum >= 0 ? 'var(--emerald)' : 'var(--rose)'}>
                  {momentum >= 0 ? '▲' : '▼'} {pct(Math.abs(momentum))}
                </Chip>
                <span className="text-[var(--faint)]">
                  {yoy ? 'last 6 full months vs same months last year' : 'last 6 full months vs prior 6'}
                </span>
              </div>
            )}
            {i === 1 && (
              <div className="mt-1.5 text-[11px] text-[var(--faint)]">
                {k.label === 'Avg order' ? 'revenue per order' : 'after cost of goods'}
              </div>
            )}
            {i === 2 &&
              (k.format === 'pct' ? (
                <div className="mt-1.5">
                  <Meter value={Math.max(0, k.value) * 4} c={st.c} h={4} />
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] text-[var(--faint)]">known buyers</div>
              ))}
            {i === 3 && (
              <div className="mt-1.5 text-[11px] text-[var(--faint)]">
                {dataset?.rows.toLocaleString()} records analyzed (sales + returns)
              </div>
            )}
          </Card>
        );
      })}

      <Card c="var(--violet)" className="md:col-span-6 xl:col-span-8" hover={false}>
        <CardHead
          icon={<Activity size={13} />}
          title={`${dataset?.fields.measure ?? 'Revenue'} trend`}
          c="var(--violet)"
          right={
            <div className="flex items-center gap-1.5">
              {partialMonth && <Chip c="var(--faint)">{partialMonth} is a partial month</Chip>}
              <Chip c="var(--violet)">Shaded: last 6 months</Chip>
              {fc && (
                <motion.button
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => go('forecast')}
                  className="chip cursor-pointer"
                  style={{ '--c': 'var(--cyan)' } as CSSProperties}
                  title={`Forecast replayed on ${fc.accuracy.months} past months: off by ${(fc.accuracy.wape * 100).toFixed(1)}% on average`}
                >
                  <LineChart size={11} />
                  Next month ≈ {usd(fc.forecast[0].value, true)} · {(fc.accuracy.wape * 100).toFixed(0)}% avg
                  miss
                </motion.button>
              )}
            </div>
          }
        />
        <div className="h-[230px] px-1 pb-2">
          <ResponsiveContainer>
            <AreaChart data={trend} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
              {glowDefs('ov', 'var(--violet)')}
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="x" {...axis} tickFormatter={(v) => String(v).slice(2)} minTickGap={18} />
              <YAxis {...axis} width={48} tickFormatter={(v) => usd(v, true)} />
              <Tooltip
                content={<ChartTip fmt={(v) => usd(v)} />}
                cursor={{ stroke: 'var(--violet)', strokeDasharray: 3 }}
              />
              {trend.length > 6 && (
                <ReferenceArea
                  x1={trend[Math.max(0, trend.length - 6)].x}
                  x2={trend[trend.length - 1].x}
                  fill="var(--rose)"
                  fillOpacity={0.07}
                />
              )}
              <Area
                type="monotone"
                dataKey="y"
                name={dataset?.fields.measure}
                stroke="url(#ov-stroke)"
                strokeWidth={2.6}
                fill="url(#ov-fill)"
                filter="url(#ov-glow)"
                animationDuration={1400}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card c={band.c} className="p-3.5 md:col-span-3 xl:col-span-4 xl:row-span-2">
        <div className="flex items-center justify-between">
          <div className="label flex items-center gap-1">
            <Radar size={11} style={{ color: band.c }} />
            Business health
          </div>
          <Chip c={band.c}>{band.label}</Chip>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <Ring value={health / 100} size={104} stroke={9} c={band.c}>
            <div>
              <CountUp value={health} className="text-[26px] font-semibold" />
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--faint)]">
                out of 100
              </div>
            </div>
          </Ring>
          <div className="flex-1 space-y-1.5">
            {Object.entries(SEV).map(([k, s]) => (
              <div key={k} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-14 font-bold" style={{ color: s.c }}>
                  {s.label}
                </span>
                <div className="flex-1">
                  <Meter value={(bySeverity[k] ?? 0) / Math.max(1, findings.length)} c={s.c} h={4} />
                </div>
                <span className="mono w-4 text-right">{bySeverity[k] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
          100 means Blindspot found nothing wrong. Every problem takes points off, more for serious,
          well-proven ones. {band.advice}
        </p>
        {top && (
          <motion.button
            whileHover={{ y: -1 }}
            onClick={() => go('risk', `?f=${encodeURIComponent(top.id)}`)}
            className="tint mt-2.5 w-full rounded-lg p-2.5 text-left"
            style={{ '--c': SEV[top.severity].c } as CSSProperties}
          >
            <div className="label" style={{ color: SEV[top.severity].c }}>
              Fix this first
            </div>
            <div className="mt-0.5 text-[12.5px] font-extrabold leading-snug">{top.title}</div>
            {top.impactUsd ? (
              <div className="mt-1 text-[11px] text-[var(--muted)]">
                <span className="mono font-semibold" style={{ color: SEV[top.severity].c }}>
                  {usd(top.impactUsd)}
                </span>{' '}
                at stake: {top.impactBasis?.toLowerCase()}
              </div>
            ) : null}
          </motion.button>
        )}
        <div className="mt-3 label">Biggest problem in each area</div>
        <div className="mt-1.5 space-y-1">
          {Object.entries(CAT)
            .filter(([k]) => findings.some((f) => f.category === k))
            .map(([k, c], i) => {
              const f = findings.find((x) => x.category === k)!;
              return (
                <motion.button
                  key={k}
                  onClick={() => go('risk', `?f=${encodeURIComponent(f.id)}`)}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                  className="row-hover flex w-full items-start gap-2 rounded-md px-1 py-1 text-left text-[12px]"
                >
                  <span className="mt-0.5 h-4 w-1 flex-none rounded-full" style={{ background: c.c }} />
                  <span className="w-24 flex-none font-bold" style={{ color: c.c }}>
                    {c.label}
                  </span>
                  <span className="leading-snug text-[var(--muted)]">{f.title}</span>
                </motion.button>
              );
            })}
        </div>
      </Card>

      <Card c="var(--orange)" className="md:col-span-6 xl:col-span-5">
        <CardHead
          icon={<Crosshair size={13} />}
          title="Top findings"
          c="var(--orange)"
          right={
            <button className="btn !h-6 !px-2 text-[11px]" onClick={() => go('risk')}>
              All
              <ArrowRight size={11} />
            </button>
          }
        />
        <div className="px-1.5 pb-2">
          {loading && !findings.length ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-7" />
              ))}
            </div>
          ) : findings.length === 0 ? (
            <div className="px-2 pb-2 text-[12px] text-[var(--muted)]">No problems found in this data.</div>
          ) : (
            findings.slice(0, 6).map((f, i) => (
              <motion.button
                key={f.id}
                onClick={() => go('risk', `?f=${encodeURIComponent(f.id)}`)}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
                className="row-hover flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left"
              >
                <span
                  className="h-6 w-1 flex-none rounded-full"
                  style={{ background: SEV[f.severity].c, boxShadow: `0 0 8px ${SEV[f.severity].c}` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-bold leading-snug">{f.title}</span>
                  <span className="block truncate text-[11.5px] text-[var(--faint)]">
                    {CAT[f.category]?.label} · {evidenceText(f)}
                    {exposureText(f) ? ` · ${exposureText(f)}` : ''}
                  </span>
                </span>
                <Confidence sure={sureOf(f)} />
                <span
                  className="mono text-[11.5px] font-semibold"
                  style={{ color: impactColor(f, SEV[f.severity].c) }}
                >
                  {f.impactUsd ? usd(f.impactUsd, true) : '—'}
                </span>
              </motion.button>
            ))
          )}
        </div>
      </Card>

      <Card c="var(--violet)" className="md:col-span-3 xl:col-span-3">
        <CardHead
          icon={<PieChart size={13} />}
          title="Sales dependence"
          c="var(--violet)"
          right={
            conc && (
              <span title="Based on how much comes from the largest and the top 5">
                <Chip
                  c={
                    conc.risk === 'high'
                      ? 'var(--rose)'
                      : conc.risk === 'medium'
                        ? 'var(--amber)'
                        : 'var(--emerald)'
                  }
                >
                  {conc.risk}
                </Chip>
              </span>
            )
          }
        />
        {conc ? (
          <>
            <div className="flex items-baseline gap-1.5 px-3.5">
              <CountUp
                value={conc.top5Share * 100}
                format={(n) => `${n.toFixed(1)}%`}
                className="text-[20px] font-semibold"
              />
              <span className="text-[11px] text-[var(--muted)]">
                of sales from your top {Math.min(5, conc.groupCount)} {conc.dimension.toLowerCase()}
                {Math.min(5, conc.groupCount) === 1 ? '' : 's'}
              </span>
            </div>
            <div className="h-[118px] px-1">
              <ResponsiveContainer>
                <ComposedChart
                  data={conc.groups
                    .slice(0, 10)
                    .map((g: any) => ({ ...g, cum: g.cumShare * 100, sh: g.share * 100 }))}
                  margin={{ top: 6, right: 8, left: -22, bottom: 0 }}
                >
                  <XAxis dataKey="key" hide />
                  <YAxis {...axis} domain={[0, 100]} />
                  <Tooltip content={<ChartTip fmt={(v) => `${v.toFixed(1)}%`} />} />
                  <Bar dataKey="sh" name="Share" radius={[3, 3, 0, 0]} animationDuration={900}>
                    {conc.groups.slice(0, 10).map((_: any, i: number) => (
                      <Cell key={i} fill={i < 5 ? 'var(--violet)' : 'var(--line-strong)'} />
                    ))}
                  </Bar>
                  <Line
                    dataKey="cum"
                    name="Running total"
                    stroke="var(--cyan)"
                    strokeWidth={2}
                    dot={false}
                    type="monotone"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="px-3.5 pb-3 text-[11px] text-[var(--muted)]">
              Just <span className="mono font-semibold text-[var(--text)]">{conc.groupsFor80Pct}</span> of{' '}
              {conc.groupCount.toLocaleString()} {conc.dimension.toLowerCase()}s bring in 80% of sales.
            </div>
          </>
        ) : concState === 'loading' ? (
          <Loading className="px-3.5 pb-3" steps={['Measuring who your sales depend on…']} />
        ) : (
          <div className="px-3.5 pb-3 text-[12px] text-[var(--muted)]">
            This data has no customer or product column to check.
          </div>
        )}
      </Card>

      <Card c="var(--emerald)" className="md:col-span-3 xl:col-span-4">
        <CardHead
          icon={<Lightbulb size={13} />}
          title="What to do about it"
          c="var(--emerald)"
          right={
            <button className="btn !h-6 !px-2 text-[11px]" onClick={() => go('simulator')}>
              Model it
              <ArrowRight size={11} />
            </button>
          }
        />
        <div className="space-y-1.5 px-3 pb-3">
          {actions.length === 0 && (
            <div className="text-[12px] text-[var(--muted)]">Nothing to fix right now.</div>
          )}
          {actions.slice(0, 3).map((a, i) => (
            <motion.div
              key={a.findingId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i }}
              className="tint rounded-lg p-2"
              style={{ '--c': 'var(--emerald)' } as CSSProperties}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="mono grid h-5 w-5 flex-none place-items-center rounded-md text-[11.5px] font-bold"
                  style={{ background: 'var(--emerald)', color: 'white' }}
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-[12px] font-bold leading-snug">{a.intervention}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-7 text-[11.5px]">
                {a.expectedBenefitUsd ? (
                  <Chip c="var(--emerald)">could win back {usd(a.expectedBenefitUsd, true)}</Chip>
                ) : null}
                <Chip
                  c={
                    a.effort === 'low'
                      ? 'var(--cyan)'
                      : a.effort === 'medium'
                        ? 'var(--amber)'
                        : 'var(--rose)'
                  }
                >
                  {a.effort === 'low' ? 'easy' : a.effort === 'medium' ? 'moderate' : 'hard'}
                </Chip>
                <span className="text-[var(--faint)]">
                  {a.recoveryPct != null
                    ? `planning scenario: ${a.recoveryPct}% recovered${a.benefitPeriod ? `, ${a.benefitPeriod}` : ''}${(a.parts?.filter((x) => x.benefit !== null).length ?? 0) > 1 ? ` · largest of ${a.parts!.filter((x) => x.benefit !== null).length} estimates, not added` : ''}`
                    : 'estimate'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>

      {seg && (seg.data?.length ?? 0) >= 2 ? (
        <Card c="var(--cyan)" className="md:col-span-3 xl:col-span-4">
          <CardHead icon={<Layers size={13} />} title={seg.title} c="var(--cyan)" />
          <div className="space-y-1.5 px-3.5 pb-3">
            {seg.data.slice(0, 7).map((d: any, i: number) => {
              const max = seg.data[0].y || 1,
                c = [
                  'var(--cyan)',
                  'var(--blue)',
                  'var(--violet)',
                  'var(--fuchsia)',
                  'var(--rose)',
                  'var(--amber)',
                  'var(--emerald)',
                ][i % 7];
              return (
                <motion.div
                  key={d.x}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="text-[11.5px]"
                >
                  <div className="flex justify-between">
                    <span className="truncate font-semibold">{d.x}</span>
                    <span className="mono">{usd(d.y, true)}</span>
                  </div>
                  <Meter value={d.y / max} c={c} h={5} />
                </motion.div>
              );
            })}
          </div>
        </Card>
      ) : (
        <DriversCard />
      )}

      <IdeasCard />
    </motion.div>
  );
}
