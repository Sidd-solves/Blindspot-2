import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { BarChart3, Crosshair, Grid3x3, MessageSquareText, ScatterChart as ScatterIcon, ShieldAlert, Target , Table2 } from 'lucide-react';
import { useStore, type Finding } from '../store';
import { CAT, SEV, get, pct, tool, usd, evidenceText, exposureText, BASIS, fmtP, fmtPV, fmtQ } from '../api';
import { Card, CardHead, Chip, CountUp, Dropdown, Empty, Meter, Reveal, Ring, Tabs, stagger } from '../components/ui';
import { ChartTip, axis } from '../components/charts';
import { go } from '../App';

/** Plain names and the right format for every evidence value: money, percent, count, p-value or plain number. */
type Kind = 'money' | 'pct' | 'count' | 'num' | 'p' | 'q' | 'text';
const EV: Record<string, [string, Kind]> = {
  top5Share: ['Share from the top 5', 'pct'], top1Share: ['Share from the largest', 'pct'], hhi: ['Concentration index (HHI)', 'num'], groupsFor80Pct: ['How many make 80% of sales', 'count'],
  returnRate: ['Return rate', 'pct'], returnedValue: ['Value returned', 'money'], grossSales: ['Sales before returns', 'money'],
  cancelledPairs: ['Order lines reversed', 'count'], value: ['Value', 'money'], share: ['Share of sales', 'pct'], unknownSales: ['Sales with no customer ID', 'money'],
  earlyRate: ['Earlier repeat rate', 'pct'], lateRate: ['Recent repeat rate', 'pct'], earlyCustomers: ['Earlier new customers', 'count'], lateCustomers: ['Recent new customers', 'count'], z: ['z statistic', 'num'],
  lapsedCustomers: ['Customers gone quiet', 'count'], bestCustomers: ['Best customers checked', 'count'], annualRevenueAtRisk: ['Their yearly sales', 'money'], shareOfRevenue: ['Share of yearly sales', 'pct'],
  stoppedProducts: ['Products at zero now', 'count'], lostRevenue: ['Their sales last year', 'money'], shareOfBaseline: ['Share of last year', 'pct'],
  before: ['Average order before', 'money'], after: ['Average order now', 'money'], ordersBefore: ['Orders before', 'count'], ordersAfter: ['Orders now', 'count'], t: ['Test statistic', 'num'],
  window: ['Period compared', 'text'], top3Share: ['Share in the top 3 months', 'pct'], baseline: ['Before', 'money'], current: ['Now', 'money'], changePct: ['Change', 'pct'], overallChangePct: ['Whole-business change', 'pct'],
  gapPts: ['Gap vs the business (points)', 'num'], p: ['Raw p-value (before adjusting)', 'p'], q: ['Adjusted for many comparisons', 'q'], impact: ['Beyond the overall trend', 'money'], segmentsScanned: ['Segments compared', 'count'],
  dimension: ['Category', 'text'], segment: ['Segment', 'text'], topOrders: ['Largest orders', 'count'], orders: ['Orders', 'count'], threshold: ['Order size cutoff', 'money'], count: ['How many', 'count'],
  nulls: ['Empty cells', 'count'], nullPct: ['Empty (%)', 'num'], pearson: ['Correlation (r)', 'num'], margin: ['Margin', 'pct'], profit: ['Profit', 'money'], sales: ['Sales', 'money'],
  inputRows: ['Rows read', 'count'], keptRows: ['Rows analysed', 'count'], duplicateRows: ['Duplicate rows', 'count'], returnLines: ['Return lines', 'count'], returnValue: ['Value returned', 'money'],
  feeLines: ['Fee and shipping lines', 'count'], feeValue: ['Fees and shipping', 'money'], zeroPriceRows: ['Zero-value rows', 'count'], missingCustomerRows: ['Rows with no customer', 'count'], missingCustomerSales: ['Sales with no customer', 'money'], cancelledPairValue: ['Value reversed', 'money'],
};
const fmtEv = (kind: Kind, v: any) => typeof v !== 'number' ? String(v) : kind === 'money' ? usd(v) : kind === 'pct' ? pct(v) : kind === 'count' ? Math.round(v).toLocaleString() : kind === 'p' ? fmtP(v) : kind === 'q' ? fmtQ(v) : (Math.round(v * 100) / 100).toLocaleString();
const guess = (k: string): [string, Kind] => {
  const label = k.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  return [label, /share|rate|margin|pct$|change/i.test(k) ? 'pct' : /sales|revenue|value|profit|amount/i.test(k) ? 'money' : /customers|orders|products|rows|lines|count|pairs/i.test(k) ? 'count' : 'num'];
};

function Evidence({ ev }: { ev: Record<string, any> }) {
  const flat = Object.entries(ev).filter(([k, v]) => v !== null && typeof v !== 'object' && k !== 'feeCodes');
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {flat.map(([k, v], i) => (
        <motion.div key={k} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className="rounded-md px-2 py-1.5" style={{ background: 'var(--line)' }}>
          <div className="text-[11.5px] font-bold text-[var(--faint)]">{(EV[k] ?? guess(k))[0]}</div>
          <div className="mono truncate text-[13px] font-semibold">{fmtEv((EV[k] ?? guess(k))[1], v)}</div>
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
      <div className="flex flex-wrap items-center gap-1.5"><Chip c={s.c} pulse={f.severity === 'critical'}>{s.label}</Chip><Chip c={c.c}>{c.label}</Chip><span className="mono text-[11.5px] text-[var(--faint)]">score {f.score}</span></div>
      <h2 className="text-[15px] font-extrabold leading-snug tracking-tight">{f.title}</h2>
      <div className="flex items-center gap-3">
        <div className="w-[132px] flex-none rounded-xl px-2.5 py-2" style={{ background: `color-mix(in srgb, ${BASIS[f.basis]?.c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${BASIS[f.basis]?.c} 35%, transparent)` }} title={BASIS[f.basis]?.hint}>
          <div className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: BASIS[f.basis]?.c }}>{BASIS[f.basis]?.label}</div>
          <div className="mono mt-0.5 text-[12px] font-semibold">{f.basis === 'tested' && f.pValue != null ? fmtPV(f) : f.basis === 'measured' ? 'Exact count' : 'Threshold'}</div>
        </div>
        <div className="flex-1">
          <div className="label">Money involved{exposureText(f) ? ` · ${exposureText(f)}` : ''}</div>
          {f.impactUsd !== null ? <CountUp value={f.impactUsd} format={(n) => usd(n)} className="text-[20px] font-semibold" /> : <div className="text-[13px] font-bold text-[var(--faint)]">Can't be put in money from this data</div>}
          <div className="text-[11.5px] text-[var(--muted)]">{f.impactBasis ?? 'This problem has no direct money figure in your data'}</div>
        </div>
      </div>
      <div><div className="label mb-1">Why it matters</div><p className="text-[12.5px] leading-relaxed text-[var(--muted)]">{f.explanation}</p></div>
      <div><div className="label mb-1.5">Evidence · {f.metric}</div><Evidence ev={f.evidence} /></div>
      {f.drill && <motion.button whileTap={{ scale: 0.97 }} whileHover={{ x: 2 }} onClick={() => go('source', `?drill=${encodeURIComponent(JSON.stringify(f.drill))}`)} className="btn w-full justify-between !h-9"><span className="flex items-center gap-1.5"><Table2 size={13} style={{ color: 'var(--sky)' }} />See the affected rows</span><span className="truncate text-[11px] font-semibold text-[var(--muted)]">{f.drill.label}</span></motion.button>}
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
            <thead><tr><th />{data.cols.map((x: string) => <th key={x} className="whitespace-nowrap px-1 text-left text-[11px] font-bold text-[var(--faint)]">{x}</th>)}</tr></thead>
            <tbody>{data.rows.map((rr: string, i: number) => (
              <tr key={rr}><td className="whitespace-nowrap pr-2 text-[11px] font-bold">{rr}</td>
                {data.values[i].map((v: number | null, j: number) => (
                  <td key={j}><motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (i * data.cols.length + j) * 0.012 }} whileHover={{ scale: 1.08 }}
                    className="mono grid h-7 min-w-[46px] place-items-center rounded-md text-[11.5px] font-semibold" style={{ background: color(v), border: v !== null && v < 0 ? '1px solid var(--rose)' : '1px solid var(--line)' }} title={`${rr} × ${data.cols[j]}: ${v === null ? 'no data' : isRatio ? pct(v) : usd(v)} (${data.counts[i][j]} rows)`}>
                    {v === null ? '·' : isRatio ? pct(v, 0) : usd(v, true)}</motion.div></td>
                ))}</tr>
            ))}</tbody>
          </table>
          <div className="mt-2 flex items-center gap-2 text-[11.5px] text-[var(--faint)]"><span className="h-2 w-6 rounded" style={{ background: 'var(--rose)' }} />loss<span className="h-2 w-6 rounded" style={{ background: 'var(--emerald)' }} />profit</div>
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
      {data && <div className="flex flex-wrap gap-1.5 px-3.5"><Chip c="var(--violet)">Top 1 {pct(data.top1Share)}</Chip><Chip c="var(--fuchsia)">Top {Math.min(5, data.groupCount)} {pct(data.top5Share)}</Chip><Chip c="var(--cyan)">80% from {data.groupsFor80Pct}/{data.groupCount}</Chip><span title="Herfindahl index: 10,000 means everything comes from one; shown for reference, not a risk verdict"><Chip c="var(--sky)">Concentration index {data.hhi.toLocaleString()}</Chip></span></div>}
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
  // x = how the finding was established (categories, not a probability); small offsets keep bubbles in one column apart.
  const EVX: Record<string, number> = { rule: 1, tested: 2, measured: 3 }, EVL = ['', 'Rule of thumb', 'Tested', 'Measured'];
  const bubbles = findings.filter((f) => f.impactUsd).map((f, i, a) => ({ x: (EVX[f.basis] ?? 1) + ((a.slice(0, i).filter((g) => g.basis === f.basis).length % 3) - 1) * 0.12, y: f.impactUsd, z: f.score, f }));

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
                    <span className="line-clamp-2 block text-[12.5px] font-bold leading-snug" title={f.title}>{f.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5"><Chip c={CAT[f.category].c}>{CAT[f.category].label}</Chip><span className="text-[11px] font-semibold" style={{ color: BASIS[f.basis]?.c }}>{evidenceText(f)}</span></span>
                  </span>
                  <span className="text-right"><span className="mono block text-[12px] font-semibold" style={{ color: s.c }}>{f.impactUsd ? usd(f.impactUsd, true) : '—'}</span><span className="block text-[11px] font-bold uppercase text-[var(--faint)]">{s.label}</span></span>
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
          <CardHead icon={<ScatterIcon size={13} />} title="Money × how it was established" c="var(--orange)" />
          <div className="h-[250px] px-1 pb-2">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 14, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="var(--line)" />
                <XAxis type="number" dataKey="x" name="Evidence" domain={[0.5, 3.5]} ticks={[1, 2, 3]} tickFormatter={(v) => EVL[v] ?? ''} {...axis} />
                <YAxis type="number" dataKey="y" name="Exposure" {...axis} width={46} tickFormatter={(v) => usd(v, true)} />
                <ZAxis type="number" dataKey="z" range={[60, 420]} />
                <Tooltip cursor={{ strokeDasharray: 3 }} content={({ active, payload }: any) => active && payload?.[0] ? <div className="panel max-w-[220px] px-2.5 py-1.5 text-[11.5px]" style={{ background: 'var(--panel-solid)' }}><div className="font-bold">{payload[0].payload.f.title}</div><div className="mono text-[var(--muted)]">{usd(payload[0].payload.y)} · {evidenceText(payload[0].payload.f)}</div></div> : null} />
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
