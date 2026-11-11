import { motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowRight, Crosshair, DollarSign, Gauge, Layers, Lightbulb, PieChart, Radar, ShoppingCart, TrendingUp, Zap } from 'lucide-react';
import { useStore } from '../store';
import { ago, get, pct, SEV, CAT, tool, usd } from '../api';
import { Card, CardHead, Chip, CountUp, Meter, Ring, Sparkline, stagger, Loading } from '../components/ui';
import { ChartTip, axis, glowDefs } from '../components/charts';
import { go } from '../App';

const KPI_STYLE = [
  { c: 'var(--violet)', icon: DollarSign }, { c: 'var(--emerald)', icon: TrendingUp }, { c: 'var(--cyan)', icon: Gauge }, { c: 'var(--amber)', icon: ShoppingCart },
];

/** Layer 2 on the front page: what moved revenue, compared with the same period last year when possible. */
function DriversCard() {
  const { version } = useStore();
  const [d, setD] = useState<any>(null), [err, setErr] = useState('');
  useEffect(() => { tool('explain-change').then((r) => (r.ok ? setD(r.data) : setErr(r.error!.message))); }, [version]);
  const drags = d ? (d.byDimension as any[]).filter((x) => !/^order/i.test(x.dimension)).flatMap((x) => x.drags.slice(0, 2).map((g: any) => ({ ...g, dim: x.dimension }))).sort((a: any, b: any) => a.delta - b.delta).slice(0, 5) : [];
  const max = Math.max(1, ...drags.map((g: any) => Math.abs(g.delta)));
  return (
    <Card c="var(--cyan)" className="md:col-span-3 xl:col-span-4">
      <CardHead icon={<Layers size={13} />} title="What's driving the change" c="var(--cyan)" right={d && <Chip c={d.changePct >= 0 ? 'var(--emerald)' : 'var(--rose)'}>{d.changePct >= 0 ? '▲' : '▼'} {pct(Math.abs(d.changePct))}</Chip>} />
      <div className="px-3.5 pb-3">
        {err && <div className="text-[11.5px] text-[var(--faint)]">{err}</div>}
        {!d && !err && <div className="skeleton h-32" />}
        {d && (<>
          <div className="text-[10.5px] text-[var(--faint)]">{d.windows.label}</div>
          {d.decomposition && <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="tint rounded-md px-2 py-1" style={{ '--c': 'var(--cyan)' } as CSSProperties}><div className="label">Orders</div><span className="mono">{d.decomposition.orders[0].toLocaleString()} → {d.decomposition.orders[1].toLocaleString()}</span></div>
            <div className="tint rounded-md px-2 py-1" style={{ '--c': 'var(--violet)' } as CSSProperties}><div className="label">Avg order</div><span className="mono">{usd(d.decomposition.aov[0])} → {usd(d.decomposition.aov[1])}</span></div>
          </div>}
          <div className="label mt-2 mb-1">Biggest drags</div>
          <div className="space-y-1">{drags.map((g: any, i: number) => (
            <motion.div key={g.dim + g.segment} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="text-[11px]" title={`${g.dim}: ${g.segment}`}>
              <div className="flex justify-between gap-2"><span className="truncate"><span className="text-[var(--faint)]">{g.dim} · </span><span className="font-semibold">{g.segment}</span></span><span className="mono flex-none" style={{ color: 'var(--rose)' }}>{usd(g.delta, true)}</span></div>
              <Meter value={Math.abs(g.delta) / max} c="var(--rose)" h={3} />
            </motion.div>
          ))}</div>
        </>)}
      </div>
    </Card>
  );
}

export default function Overview() {
  const { dash, findings, bySeverity, actions, dataset, loading, version, conn } = useStore();
  const [conc, setConc] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!dataset) return;
    const dim = dataset.fields.highCardDims[0];
    if (dim) tool('interpret-concentration', { dimension: dim, limit: 12 }).then((r) => setConc(r.ok ? r.data : null));
    const load = () => get('/api/activity').then(setActivity).catch(() => {});
    load(); const t = setInterval(load, 4000); return () => clearInterval(t);
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dash) return <Loading steps={['Loading dataset…', 'Profiling columns…', 'Detecting risks…', 'Ranking findings…']} />;
  const trend = dash.charts.find((c) => c.type === 'line')?.data ?? [];
  const seg = dash.charts.find((c) => c.type === 'bar');
  const series = trend.map((d: any) => d.y);
  const half = Math.floor(series.length / 2);
  // With 18+ months, compare against the same months last year so seasonality doesn't fake growth.
  const yoy = series.length >= 18;
  const recentSum = series.slice(-6).reduce((a: number, b: number) => a + b, 0), priorSum = (yoy ? series.slice(-18, -12) : series.slice(-12, -6)).reduce((a: number, b: number) => a + b, 0);
  const momentum = priorSum ? (recentSum - priorSum) / priorSum : 0;
  const riskIndex = Math.min(100, Math.round(findings.reduce((s, f) => s + (SEV[f.severity]?.w ?? 1) * f.confidence, 0) * 3.2));
  // Largest single exposure: exposures overlap (e.g. concentration and outliers share revenue), so summing would double count.
  const exposure = Math.max(0, ...findings.map((f) => f.impactUsd ?? 0));
  const fmt = (k: { format: string; value: number }) => (k.format === 'usd' ? (n: number) => usd(n, k.value >= 10000) : k.format === 'pct' ? (n: number) => pct(n) : (n: number) => Math.round(n).toLocaleString());

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 md:grid-cols-6 xl:grid-cols-12">
      {dash.kpis.slice(0, 4).map((k, i) => {
        const st = KPI_STYLE[i];
        const spark = k.format === 'pct' ? [] : k.label === 'Orders' ? [] : series;
        return (
          <Card key={k.label} c={st.c} className="p-3 md:col-span-3 xl:col-span-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="label flex items-center gap-1"><st.icon size={11} style={{ color: st.c }} />{k.label}</div>
                <CountUp value={k.value} format={fmt(k)} className="mt-1 block text-[22px] font-semibold tracking-tight" />
              </div>
              {spark.length > 1 ? <Sparkline data={spark.slice(-12)} c={st.c} /> : k.format === 'pct' ? <Ring value={Math.max(0, k.value) * 4} size={42} stroke={5} c={st.c}><span className="mono text-[9px]">{pct(k.value, 0)}</span></Ring> : <div className="flex items-end gap-[3px]">{series.slice(-10).map((v: number, j: number) => <motion.span key={j} className="w-[5px] rounded-sm" style={{ background: st.c, opacity: 0.35 + j / 16 }} initial={{ height: 0 }} animate={{ height: 6 + (v / Math.max(...series)) * 20 }} transition={{ delay: j * 0.04 }} />)}</div>}
            </div>
            {i === 0 && <div className="mt-1.5 flex items-center gap-1.5 text-[11px]"><Chip c={momentum >= 0 ? 'var(--emerald)' : 'var(--rose)'}>{momentum >= 0 ? '▲' : '▼'} {pct(Math.abs(momentum))}</Chip><span className="text-[var(--faint)]">{yoy ? 'last 6 mo vs same months last year' : 'last 6 mo vs prior 6'}</span></div>}
            {i === 1 && <div className="mt-1.5 text-[11px] text-[var(--faint)]">{k.label === 'Avg order' ? 'revenue per order' : 'after cost of goods'}</div>}
            {i === 2 && (k.format === 'pct' ? <div className="mt-1.5"><Meter value={Math.max(0, k.value) * 4} c={st.c} h={4} /></div> : <div className="mt-1.5 text-[11px] text-[var(--faint)]">known buyers</div>)}
            {i === 3 && <div className="mt-1.5 text-[11px] text-[var(--faint)]">{dataset?.rows.toLocaleString()} sales lines analysed</div>}
          </Card>
        );
      })}

      <Card c="var(--violet)" className="md:col-span-6 xl:col-span-8" hover={false}>
        <CardHead icon={<Activity size={13} />} title={`${dataset?.fields.measure ?? 'Revenue'} trend`} c="var(--violet)" right={<div className="flex items-center gap-1.5"><Chip c="var(--rose)">Shaded: last 6 months</Chip></div>} />
        <div className="h-[230px] px-1 pb-2">
          <ResponsiveContainer>
            <AreaChart data={trend} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
              {glowDefs('ov', 'var(--violet)')}
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="x" {...axis} tickFormatter={(v) => String(v).slice(2)} minTickGap={18} />
              <YAxis {...axis} width={48} tickFormatter={(v) => usd(v, true)} />
              <Tooltip content={<ChartTip fmt={(v) => usd(v)} />} cursor={{ stroke: 'var(--violet)', strokeDasharray: 3 }} />
              {trend.length > 6 && <ReferenceArea x1={trend[Math.max(0, trend.length - 6)].x} x2={trend[trend.length - 1].x} fill="var(--rose)" fillOpacity={0.07} />}
              <Area type="monotone" dataKey="y" name={dataset?.fields.measure} stroke="url(#ov-stroke)" strokeWidth={2.6} fill="url(#ov-fill)" filter="url(#ov-glow)" animationDuration={1400} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card c="var(--rose)" className="p-3.5 md:col-span-3 xl:col-span-4 xl:row-span-2" onClick={() => go('risk')}>
        <div className="flex items-center justify-between"><div className="label flex items-center gap-1"><Radar size={11} style={{ color: 'var(--rose)' }} />Risk index</div><ArrowRight size={13} className="text-[var(--faint)]" /></div>
        <div className="mt-2 flex items-center gap-4">
          <Ring value={riskIndex / 100} size={104} stroke={9} c={riskIndex > 66 ? 'var(--rose)' : riskIndex > 33 ? 'var(--amber)' : 'var(--emerald)'}>
            <div><CountUp value={riskIndex} className="text-[26px] font-semibold" /><div className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--faint)]">of 100</div></div>
          </Ring>
          <div className="flex-1 space-y-1.5">
            {Object.entries(SEV).map(([k, s]) => (
              <div key={k} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-14 font-bold" style={{ color: s.c }}>{s.label}</span>
                <div className="flex-1"><Meter value={(bySeverity[k] ?? 0) / Math.max(1, findings.length)} c={s.c} h={4} /></div>
                <span className="mono w-4 text-right">{bySeverity[k] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="tint rounded-lg p-2" style={{ '--c': 'var(--rose)' } as CSSProperties}><div className="label">Largest exposure</div><CountUp value={exposure} format={(n) => usd(n, true)} className="text-[15px] font-semibold" /></div>
          <div className="tint rounded-lg p-2" style={{ '--c': 'var(--violet)' } as CSSProperties}><div className="label">Findings</div><CountUp value={findings.length} className="text-[15px] font-semibold" /></div>
        </div>
        <div className="mt-3 label">Top finding by category</div>
        <div className="mt-1.5 space-y-1">
          {Object.entries(CAT).filter(([k]) => findings.some((f) => f.category === k)).map(([k, c], i) => {
            const f = findings.find((x) => x.category === k)!;
            return (
              <motion.div key={k} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.06 }} className="flex items-center gap-2 text-[11.5px]">
                <span className="h-5 w-1 rounded-full" style={{ background: c.c, boxShadow: `0 0 6px ${c.c}` }} />
                <span className="w-24 flex-none font-bold" style={{ color: c.c }}>{c.label}</span>
                <span className="truncate text-[var(--muted)]">{f.title}</span>
              </motion.div>
            );
          })}
        </div>
        <div className="mt-3 text-[10px] text-[var(--faint)]" title="Sum of severity weight (critical 4 … low 1) x confidence across findings, scaled and capped at 100">How it's computed: severity weight × confidence, summed and capped at 100.</div>
      </Card>

      <Card c="var(--orange)" className="md:col-span-6 xl:col-span-5">
        <CardHead icon={<Crosshair size={13} />} title="Top findings" c="var(--orange)" right={<button className="btn !h-6 !px-2 text-[11px]" onClick={() => go('risk')}>All<ArrowRight size={11} /></button>} />
        <div className="px-1.5 pb-2">
          {loading && !findings.length ? <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-7" />)}</div> : findings.slice(0, 6).map((f, i) => (
            <motion.button key={f.id} onClick={() => go('risk', `?f=${encodeURIComponent(f.id)}`)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className="row-hover flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left">
              <span className="h-6 w-1 flex-none rounded-full" style={{ background: SEV[f.severity].c, boxShadow: `0 0 8px ${SEV[f.severity].c}` }} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-bold">{f.title}</span><span className="block truncate text-[10.5px] text-[var(--faint)]">{CAT[f.category]?.label} · {Math.round(f.confidence * 100)}% confidence</span></span>
              <span className="mono text-[11.5px] font-semibold" style={{ color: SEV[f.severity].c }}>{f.impactUsd ? usd(f.impactUsd, true) : '—'}</span>
            </motion.button>
          ))}
        </div>
      </Card>

      <Card c="var(--violet)" className="md:col-span-3 xl:col-span-3">
        <CardHead icon={<PieChart size={13} />} title={conc ? `${conc.dimension} concentration` : 'Concentration'} c="var(--violet)" right={conc && <Chip c={conc.risk === 'high' ? 'var(--rose)' : conc.risk === 'medium' ? 'var(--amber)' : 'var(--emerald)'}>{conc.risk}</Chip>} />
        {conc ? (
          <>
            <div className="flex items-baseline gap-1.5 px-3.5"><CountUp value={conc.top5Share * 100} format={(n) => `${n.toFixed(1)}%`} className="text-[20px] font-semibold" /><span className="text-[11px] text-[var(--muted)]">from top 5</span></div>
            <div className="h-[128px] px-1">
              <ResponsiveContainer>
                <ComposedChart data={conc.groups.slice(0, 10).map((g: any) => ({ ...g, cum: g.cumShare * 100, sh: g.share * 100 }))} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                  <XAxis dataKey="key" hide />
                  <YAxis {...axis} domain={[0, 100]} />
                  <Tooltip content={<ChartTip fmt={(v) => `${v.toFixed(1)}%`} />} />
                  <Bar dataKey="sh" name="Share" radius={[3, 3, 0, 0]} animationDuration={900}>{conc.groups.slice(0, 10).map((_: any, i: number) => <Cell key={i} fill={i < 5 ? 'var(--violet)' : 'var(--line-strong)'} />)}</Bar>
                  <Line dataKey="cum" name="Cumulative" stroke="var(--cyan)" strokeWidth={2} dot={false} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="px-3.5 pb-3 text-[11px] text-[var(--muted)]"><span className="mono font-semibold text-[var(--text)]">{conc.groupsFor80Pct}</span> of {conc.groupCount} drive 80% · HHI <span className="mono">{conc.hhi}</span></div>
          </>
        ) : <div className="p-4"><div className="skeleton h-32" /></div>}
      </Card>

      <Card c="var(--emerald)" className="md:col-span-3 xl:col-span-4">
        <CardHead icon={<Lightbulb size={13} />} title="Recommended actions" c="var(--emerald)" right={<button className="btn !h-6 !px-2 text-[11px]" onClick={() => go('simulator')}>Model it<ArrowRight size={11} /></button>} />
        <div className="space-y-1.5 px-3 pb-3">
          {actions.slice(0, 3).map((a, i) => (
            <motion.div key={a.findingId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }} className="tint rounded-lg p-2" style={{ '--c': 'var(--emerald)' } as CSSProperties}>
              <div className="flex items-center justify-between gap-2"><span className="mono grid h-5 w-5 place-items-center rounded-md text-[10.5px] font-bold" style={{ background: 'var(--emerald)', color: 'white' }}>{i + 1}</span><span className="flex-1 truncate text-[12px] font-bold">{a.intervention}</span></div>
              <div className="mt-1 flex items-center gap-1.5 pl-7 text-[10.5px]"><Chip c="var(--emerald)">{usd(a.expectedBenefitUsd, true)} {a.benefitKind}</Chip><Chip c={a.effort === 'low' ? 'var(--cyan)' : a.effort === 'medium' ? 'var(--amber)' : 'var(--rose)'}>{a.effort} effort</Chip><span className="truncate text-[var(--faint)]">hypothetical</span></div>
            </motion.div>
          ))}
        </div>
      </Card>

      {!seg && <DriversCard />}
      {seg && <Card c="var(--cyan)" className="md:col-span-3 xl:col-span-4">
        <CardHead icon={<Layers size={13} />} title={seg?.title ?? 'Segments'} c="var(--cyan)" />
        <div className="h-[150px] px-1 pb-2">
          <ResponsiveContainer>
            <BarChart data={seg?.data ?? []} layout="vertical" margin={{ top: 0, right: 16, left: 6, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="x" {...axis} width={80} />
              <Tooltip content={<ChartTip fmt={(v) => usd(v)} />} cursor={{ fill: 'var(--line)' }} />
              <Bar dataKey="y" name="Revenue" radius={[0, 5, 5, 0]} barSize={14} animationDuration={1000}>{(seg?.data ?? []).map((_: any, i: number) => <Cell key={i} fill={['var(--cyan)', 'var(--blue)', 'var(--violet)', 'var(--fuchsia)', 'var(--rose)'][i % 5]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>}

      <Card c="var(--blue)" className="md:col-span-3 xl:col-span-4">
        <CardHead icon={<Zap size={13} />} title="Live activity" c="var(--blue)" right={<Chip c="var(--emerald)" pulse>Live</Chip>} />
        <div className="max-h-[150px] space-y-0.5 overflow-y-auto px-2 pb-2">
          {activity.slice(0, 8).map((a, i) => (
            <motion.div key={a.at + a.tool} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[11.5px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.ok ? 'var(--emerald)' : 'var(--rose)' }} />
              <span className="mono truncate font-semibold">{a.tool}</span>
              <span className="mono ml-auto text-[10.5px] text-[var(--faint)]">{a.ms}ms · {ago(a.at, now)}</span>
            </motion.div>
          ))}
        </div>
      </Card>

      <Card c="var(--fuchsia)" className="p-3 md:col-span-6 xl:col-span-4">
        <div className="label mb-2">Connections</div>
        <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
          {conn && (['tableau', 'bridge', 'mcp', 'ai'] as const).map((k) => {
            const s = conn[k]; const good = ['connected', 'running', 'ok', 'configured'].includes(s.status);
            return <div key={k} className="tint flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ '--c': good ? 'var(--emerald)' : 'var(--amber)' } as CSSProperties} title={s.detail}><span className="pulse-dot" style={{ '--c': good ? 'var(--emerald)' : 'var(--amber)' } as CSSProperties} /><span className="font-bold uppercase">{k}</span><span className="ml-auto truncate text-[10.5px] text-[var(--muted)]">{s.status.replace('_', ' ')}</span></div>;
          })}
        </div>
        <div className="mt-2 truncate text-[10.5px] text-[var(--faint)]">{dataset?.label} · {dataset?.name} · {half * 2} months</div>
      </Card>
    </motion.div>
  );
}
