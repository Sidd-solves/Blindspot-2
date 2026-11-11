import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { BarChart3, Crosshair, Grid3x3, MessageSquareText, ScatterChart as ScatterIcon, ShieldAlert, Target } from 'lucide-react';
import { useStore, type Finding } from '../store';
import { CAT, SEV, get, pct, tool, usd } from '../api';
import { Card, CardHead, Chip, CountUp, Dropdown, Empty, Meter, Reveal, Ring, Tabs, stagger } from '../components/ui';
import { ChartTip, axis } from '../components/charts';
import { go } from '../App';

function Evidence({ ev }: { ev: Record<string, any> }) {
  const flat = Object.entries(ev).filter(([, v]) => v !== null && typeof v !== 'object');
  const fmt = (k: string, v: any) => typeof v !== 'number' ? String(v) : /share|margin|pct|trend/i.test(k) ? pct(v) : /profit|sales|prior|recent|threshold|value/i.test(k) ? usd(v) : v.toLocaleString();
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {flat.map(([k, v], i) => (
        <motion.div key={k} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className="rounded-md px-2 py-1.5" style={{ background: 'var(--line)' }}>
          <div className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--faint)]">{k.replace(/([A-Z])/g, ' $1')}</div>
          <div className="mono truncate text-[12px] font-semibold">{fmt(k, v)}</div>
        </motion.div>
      ))}
      {Array.isArray(ev.topGroups) && <div className="col-span-2 space-y-1 pt-1">{ev.topGroups.map((g: any) => <div key={g.key} className="flex items-center gap-2 text-[11px]"><span className="w-20 truncate font-semibold">{g.key}</span><div className="flex-1"><Meter value={g.share * 2.5} c="var(--violet)" h={4} /></div><span className="mono">{pct(g.share)}</span></div>)}</div>}
    </div>
  );
}

function Detail({ f }: { f: Finding }) {
  const s = SEV[f.severity], c = CAT[f.category];
  return (
    <motion.div key={f.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ type: 'spring', stiffness: 280, damping: 28 }} className="space-y-3 p-3.5">
      <div className="flex flex-wrap items-center gap-1.5"><Chip c={s.c} pulse={f.severity === 'critical'}>{s.label}</Chip><Chip c={c.c}>{c.label}</Chip><span className="mono text-[10.5px] text-[var(--faint)]">score {f.score}</span></div>
      <h2 className="text-[15px] font-extrabold leading-snug tracking-tight">{f.title}</h2>
      <div className="flex items-center gap-3">
        <Ring value={f.confidence} size={64} stroke={6} c={s.c}><span className="mono text-[12px] font-semibold">{Math.round(f.confidence * 100)}%</span></Ring>
        <div className="flex-1">
          <div className="label">Dollar exposure</div>
          {f.impactUsd !== null ? <CountUp value={f.impactUsd} format={(n) => usd(n)} className="text-[20px] font-semibold" /> : <div className="text-[13px] font-bold text-[var(--faint)]">Not quantifiable</div>}
          <div className="text-[10.5px] text-[var(--muted)]">{f.impactBasis ?? 'No dollar basis in the data'}</div>
        </div>
      </div>
      <div><div className="label mb-1">Why it matters</div><p className="text-[12.5px] leading-relaxed text-[var(--muted)]">{f.explanation}</p></div>
      <div><div className="label mb-1.5">Evidence · {f.metric}</div><Evidence ev={f.evidence} /></div>
      <div className="tint rounded-lg p-2.5" style={{ '--c': 'var(--emerald)' } as CSSProperties}><div className="label mb-0.5" style={{ color: 'var(--emerald)' }}>Next action</div><div className="text-[12.5px] font-bold">{f.nextAction}</div></div>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => go('analyst', `?q=${encodeURIComponent(`Explain this finding and what to do: ${f.title}`)}`)}><MessageSquareText size={13} />Ask analyst</button>
        <button className="btn" onClick={() => go('simulator')}><Target size={13} />Model impact</button>
      </div>
    </motion.div>
  );
}

function Heatmap() {
  const { dataset, version } = useStore();
  const dims = dataset?.columns.filter((c) => c.type === 'category' && c.distinct <= 16).map((c) => c.name) ?? [];
  const [row, setRow] = useState<string[]>([]), [col, setCol] = useState<string[]>([]);
  const [data, setData] = useState<any>(null);
  const r = row[0] ?? dims[0], c = col[0] ?? dims.find((d) => d !== r && /sub|categ/i.test(d)) ?? dims[1];
  const f = dataset?.fields;
  useEffect(() => {
    if (!r || !c || !f) return;
    const q = f.profit ? `measure=${encodeURIComponent(f.profit)}&ratioOf=${encodeURIComponent(f.measure)}` : `measure=${encodeURIComponent(f.measure)}`;
    get(`/api/crosstab?row=${encodeURIComponent(r)}&col=${encodeURIComponent(c)}&${q}`).then(setData).catch(() => setData(null));
  }, [r, c, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const vals: number[] = data?.values.flat().filter((v: any) => v !== null) ?? [];
  const max = Math.max(...vals.map(Math.abs), 0.0001);
  const isRatio = !!data?.ratioOf;
  const color = (v: number | null) => v === null ? 'transparent' : v < 0 ? `color-mix(in srgb, var(--rose) ${20 + (Math.abs(v) / max) * 70}%, transparent)` : `color-mix(in srgb, var(--emerald) ${12 + (v / max) * 70}%, transparent)`;
  return (
    <Card c="var(--emerald)" hover={false}>
      <CardHead icon={<Grid3x3 size={13} />} title={isRatio ? 'Margin heatmap' : 'Heatmap'} c="var(--emerald)" right={<div className="flex gap-1.5"><Dropdown width={112} value={row} options={dims} onChange={setRow} placeholder={r ?? 'Rows'} c="var(--emerald)" /><Dropdown width={122} value={col} options={dims.filter((d) => d !== r)} onChange={setCol} placeholder={c ?? 'Columns'} c="var(--emerald)" /></div>} />
      {dims.length < 2 ? <Empty icon={<Grid3x3 size={18} />} title="No small categories to cross">This data has no pair of columns with few enough values for a heatmap.</Empty> : data ? (
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
            <thead><tr><th />{data.cols.map((x: string) => <th key={x} className="whitespace-nowrap px-1 text-left text-[10px] font-bold text-[var(--faint)]">{x}</th>)}</tr></thead>
            <tbody>{data.rows.map((rr: string, i: number) => (
              <tr key={rr}><td className="whitespace-nowrap pr-2 text-[11px] font-bold">{rr}</td>
                {data.values[i].map((v: number | null, j: number) => (
                  <td key={j}><motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (i * data.cols.length + j) * 0.012 }} whileHover={{ scale: 1.08 }}
                    className="mono grid h-7 min-w-[46px] place-items-center rounded-md text-[10.5px] font-semibold" style={{ background: color(v), border: v !== null && v < 0 ? '1px solid var(--rose)' : '1px solid var(--line)' }} title={`${rr} × ${data.cols[j]}: ${v === null ? 'no data' : isRatio ? pct(v) : usd(v)} (${data.counts[i][j]} rows)`}>
                    {v === null ? '·' : isRatio ? pct(v, 0) : usd(v, true)}</motion.div></td>
                ))}</tr>
            ))}</tbody>
          </table>
          <div className="mt-2 flex items-center gap-2 text-[10.5px] text-[var(--faint)]"><span className="h-2 w-6 rounded" style={{ background: 'var(--rose)' }} />loss<span className="h-2 w-6 rounded" style={{ background: 'var(--emerald)' }} />profit</div>
        </div>
      ) : <div className="p-4"><div className="skeleton h-40" /></div>}
    </Card>
  );
}

function Pareto() {
  const { dataset, version } = useStore();
  const dims = dataset ? [...dataset.fields.highCardDims, ...dataset.fields.dims].filter((d) => !/^(order|invoice)/i.test(d)) : [];
  const [dim, setDim] = useState<string[]>([]);
  const [data, setData] = useState<any>(null);
  const d = dim[0] ?? dims[0];
  useEffect(() => { if (d) tool('interpret-concentration', { dimension: d, limit: 20 }).then((r) => setData(r.ok ? r.data : null)); }, [d, version]);
  return (
    <Card c="var(--violet)" hover={false}>
      <CardHead icon={<BarChart3 size={13} />} title="Pareto concentration" c="var(--violet)" right={<Dropdown width={130} value={dim} options={[...new Set(dims)]} onChange={setDim} placeholder={d ?? 'Dimension'} />} />
      {data && <div className="flex flex-wrap gap-1.5 px-3.5"><Chip c="var(--violet)">Top 1 {pct(data.top1Share)}</Chip><Chip c="var(--fuchsia)">Top 5 {pct(data.top5Share)}</Chip><Chip c="var(--cyan)">80% from {data.groupsFor80Pct}/{data.groupCount}</Chip><Chip c={data.hhi > 2500 ? 'var(--rose)' : data.hhi > 1500 ? 'var(--amber)' : 'var(--emerald)'}>HHI {data.hhi}</Chip></div>}
      <div className="h-[210px] px-1 pb-2 pt-1">
        <ResponsiveContainer>
          <ComposedChart data={(data?.groups ?? []).map((g: any) => ({ ...g, sh: g.share * 100, cum: g.cumShare * 100 }))} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="key" {...axis} interval={0} angle={-35} textAnchor="end" height={46} tickFormatter={(v) => String(v).replace('Customer ', 'C')} />
            <YAxis {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<ChartTip fmt={(v) => `${v.toFixed(1)}%`} />} cursor={{ fill: 'var(--line)' }} />
            <Bar dataKey="sh" name="Share" radius={[4, 4, 0, 0]} animationDuration={900}>{(data?.groups ?? []).map((g: any, i: number) => <Cell key={i} fill={g.cumShare <= 0.8 ? 'var(--violet)' : 'var(--line-strong)'} />)}</Bar>
            <Line dataKey="cum" name="Cumulative" stroke="var(--cyan)" strokeWidth={2.2} dot={{ r: 2 }} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {data && <div className="px-3.5 pb-3 text-[11.5px] text-[var(--muted)]">{data.interpretation}</div>}
    </Card>
  );
}

export default function Risk() {
  const { findings, loading } = useStore();
  const [cat, setCat] = useState('all');
  const initial = new URLSearchParams(location.hash.split('?')[1] ?? '').get('f');
  const [sel, setSel] = useState<string | null>(initial);
  const list = useMemo(() => (cat === 'all' ? findings : findings.filter((f) => f.category === cat)), [cat, findings]);
  const selected = findings.find((f) => f.id === sel) ?? list[0];
  const cats = Object.entries(CAT).filter(([k]) => findings.some((f) => f.category === k));
  const bubbles = findings.filter((f) => f.impactUsd).map((f) => ({ x: Math.round(f.confidence * 100), y: f.impactUsd, z: f.score, f }));

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 xl:grid-cols-12">
      <Card c="var(--rose)" className="xl:col-span-7" hover={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-2 pt-1.5" style={{ borderColor: 'var(--line)' }}>
          <Tabs layoutId="risk-tabs" value={cat} onChange={setCat} tabs={[{ id: 'all', label: 'All', count: findings.length }, ...cats.map(([k, c]) => ({ id: k, label: c.label, c: c.c, count: findings.filter((f) => f.category === k).length }))]} />
        </div>
        <div className="max-h-[470px] overflow-y-auto p-1.5">
          {loading && !findings.length && <div className="space-y-2 p-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-10" />)}</div>}
          {!loading && !list.length && <Empty icon={<ShieldAlert size={18} />} title="No findings here">Nothing in this category crossed the detection thresholds.</Empty>}
          <AnimatePresence initial={false}>
            {list.map((f, i) => {
              const s = SEV[f.severity], on = selected?.id === f.id;
              return (
                <motion.button layout key={f.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.025 }} onClick={() => setSel(f.id)}
                  className="row-hover relative grid w-full grid-cols-[4px_1fr_auto] items-center gap-2.5 rounded-lg px-2 py-2 text-left" style={on ? { background: `color-mix(in srgb, ${s.c} 10%, transparent)` } : undefined}>
                  <span className="h-8 rounded-full" style={{ background: s.c, boxShadow: on ? `0 0 10px ${s.c}` : 'none' }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold">{f.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5"><Chip c={CAT[f.category].c}>{CAT[f.category].label}</Chip><span className="w-20"><Meter value={f.confidence} c={s.c} h={3} /></span><span className="mono text-[10px] text-[var(--faint)]">{Math.round(f.confidence * 100)}%</span></span>
                  </span>
                  <span className="text-right"><span className="mono block text-[12px] font-semibold" style={{ color: s.c }}>{f.impactUsd ? usd(f.impactUsd, true) : '—'}</span><span className="block text-[10px] font-bold uppercase text-[var(--faint)]">{s.label}</span></span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </Card>

      <Card c={selected ? SEV[selected.severity].c : 'var(--rose)'} className="xl:col-span-5 xl:row-span-1" hover={false}>
        <AnimatePresence mode="wait">{selected ? <Detail f={selected} /> : <Empty icon={<Crosshair size={18} />} title="Select a finding" />}</AnimatePresence>
      </Card>

      <div className="xl:col-span-4"><Reveal>
        <Card c="var(--orange)" hover={false}>
          <CardHead icon={<ScatterIcon size={13} />} title="Impact × confidence" c="var(--orange)" />
          <div className="h-[250px] px-1 pb-2">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 14, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="var(--line)" />
                <XAxis type="number" dataKey="x" name="Confidence" unit="%" domain={[40, 100]} {...axis} />
                <YAxis type="number" dataKey="y" name="Exposure" {...axis} width={46} tickFormatter={(v) => usd(v, true)} />
                <ZAxis type="number" dataKey="z" range={[60, 420]} />
                <Tooltip cursor={{ strokeDasharray: 3 }} content={({ active, payload }: any) => active && payload?.[0] ? <div className="panel max-w-[220px] px-2.5 py-1.5 text-[11.5px]" style={{ background: 'var(--panel-solid)' }}><div className="font-bold">{payload[0].payload.f.title}</div><div className="mono text-[var(--muted)]">{usd(payload[0].payload.y)} · {payload[0].payload.x}%</div></div> : null} />
                <Scatter data={bubbles} onClick={(p: any) => setSel(p.f.id)} animationDuration={900}>
                  {bubbles.map((b, i) => <Cell key={i} fill={SEV[b.f.severity].c} fillOpacity={0.75} stroke={SEV[b.f.severity].c} style={{ filter: `drop-shadow(0 0 6px ${SEV[b.f.severity].c})`, cursor: 'pointer' }} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Reveal></div>
      <div className="xl:col-span-4"><Reveal><Pareto /></Reveal></div>
      <div className="xl:col-span-4"><Reveal><Heatmap /></Reveal></div>
    </motion.div>
  );
}
