import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bot, Brush, Check, FileText, FlaskConical, MessageSquareText, Radar, ShieldAlert, ShoppingBag, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { CAT, SEV, tool, usd, VERDICT } from '../api';
import { useStore } from '../store';
import { CountUp, Meter, Reveal, Ring } from '../components/ui';
import { BeamCard } from './Effects';
import { FinalCta, useHealth } from './Home';
import { openApp } from './SiteLayout';

const Head = ({ icon: I, c, t }: { icon: any; c: string; t: string }) => (
  <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, boxShadow: `0 0 18px -6px ${c}` }}><I size={15} style={{ color: c }} /></span><span className="text-[14px] font-extrabold">{t}</span></div>
);

function TypingChat() {
  const { findings } = useStore();
  const answer = findings[0] ? `${findings[0].title}. ${findings[0].nextAction}` : 'Analysing your data…';
  const [n, setN] = useState(0);
  const started = useRef(false);
  useEffect(() => { setN(0); started.current = false; }, [answer]);
  useEffect(() => { const t = setInterval(() => setN((x) => (x < answer.length ? x + 2 : x)), 22); return () => clearInterval(t); }, [answer]);
  return (
    <div className="mt-3 space-y-2">
      <div className="ml-auto w-fit max-w-[85%] rounded-xl px-3 py-1.5 text-[12px]" style={{ background: 'color-mix(in srgb, var(--violet) 18%, transparent)' }}>What's my biggest problem right now?</div>
      <div className="flex gap-2"><span className="grid h-6 w-6 flex-none place-items-center rounded-md" style={{ background: 'linear-gradient(135deg, var(--fuchsia), var(--violet))' }}><Bot size={13} color="white" /></span>
        <div className="rounded-xl px-3 py-1.5 text-[12px] leading-relaxed" style={{ background: 'var(--line)' }}>{answer.slice(0, n)}{n < answer.length && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[var(--fuchsia)] align-middle" />}</div></div>
      <div className="flex flex-wrap gap-1 pl-8">{['Top 5 customers by sales', 'Why did sales change?', 'Sales by month'].map((q) => <span key={q} className="chip" style={{ '--c': 'var(--cyan)' } as CSSProperties}>{q}</span>)}</div>
    </div>
  );
}

function MiniSimulator() {
  const [v, setV] = useState(8), [res, setRes] = useState<any>(null);
  useEffect(() => { const t = setTimeout(() => tool('run-scenario', { levers: { churnReductionPct: v, opexReductionPct: 0 } }).then((r) => r.ok && setRes(r.data)), 120); return () => clearTimeout(t); }, [v]);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[12px]"><span className="font-bold">Keep more customers</span><span className="mono font-semibold" style={{ color: 'var(--emerald)' }}>{v}%</span></div>
      <div style={{ '--c': 'var(--emerald)', '--p': `${(v / 30) * 100}%` } as CSSProperties}><input type="range" min={0} max={30} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label="Keep more customers" className="mt-1.5" /></div>
      <div className="mt-3 flex items-baseline gap-1"><span className="text-[13px] text-[var(--muted)]">Extra profit / year</span><span className="ml-auto text-[22px] font-semibold" style={{ color: 'var(--emerald)' }}>+</span><CountUp value={res?.delta.profit ?? 0} format={(n) => usd(n)} className="grad-text text-[22px] font-semibold" duration={0.5} /></div>
      <div className="text-[11.5px] text-[var(--faint)]">Estimate from the shop's real sales. Drag the slider.</div>
    </div>
  );
}

export default function Features() {
  const { findings, dataset } = useStore();
  const health = useHealth();
  const [ideas, setIdeas] = useState<any[]>([]);
  useEffect(() => { tool('test-hypotheses', { useAI: false }).then((r) => r.ok && setIdeas(r.data.results.filter((h: any) => h.verdict !== 'inconclusive'))); }, [dataset?.name]);
  const band = health >= 80 ? ['Healthy', 'var(--emerald)'] : health >= 60 ? ['Fair', 'var(--cyan)'] : health >= 40 ? ['Needs attention', 'var(--amber)'] : ['At risk', 'var(--rose)'];
  const prep = dataset?.prep;

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-10 text-center md:px-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="label" style={{ color: 'var(--fuchsia)' }}>Features</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="text-glow mx-auto mt-2 max-w-3xl text-[34px] font-extrabold leading-tight tracking-tight md:text-[48px]">Everything a data team would do. <span className="grad-text">In one screen.</span></motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-3 text-[13px] text-[var(--muted)]">Every card below is live, running on a real shop's data right now.</motion.p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-3 px-4 pb-16 md:grid-cols-6 md:px-6">
        {/* Health: tall */}
        <Reveal className="md:col-span-2 md:row-span-2"><BeamCard c={band[1]} className="flex h-full flex-col p-5">
          <Head icon={Radar} c={band[1]} t="Business health score" />
          <div className="my-5 grid place-items-center"><Ring value={health / 100} size={150} stroke={11} c={band[1]}><div className="text-center"><CountUp value={health} className="text-[40px] font-semibold leading-none" /><div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-[var(--faint)]">out of 100</div></div></Ring></div>
          <div className="text-center"><span className="chip" style={{ '--c': band[1] } as CSSProperties}>{band[0]}</span></div>
          <p className="mt-3 text-center text-[12px] text-[var(--muted)]">One number for how your business is doing. Every problem found takes points off, more for serious ones.</p>
          <div className="mt-auto space-y-1.5 pt-4">{Object.entries(SEV).map(([k, s]) => { const n = findings.filter((f) => f.severity === k).length; return <div key={k} className="flex items-center gap-2 text-[11px]"><span className="w-14 font-bold" style={{ color: s.c }}>{s.label}</span><div className="flex-1"><Meter value={n / Math.max(1, findings.length)} c={s.c} h={4} /></div><span className="mono w-4 text-right">{n}</span></div>; })}</div>
        </BeamCard></Reveal>

        {/* AI analyst: wide */}
        <Reveal className="md:col-span-4"><BeamCard c="var(--fuchsia)" className="h-full p-5"><Head icon={MessageSquareText} c="var(--fuchsia)" t="Ask your data anything" /><TypingChat /></BeamCard></Reveal>

        {/* Ranked problems */}
        <Reveal className="md:col-span-2"><BeamCard c="var(--rose)" className="h-full p-5"><Head icon={ShieldAlert} c="var(--rose)" t="Every problem, ranked by money" />
          <div className="mt-3 space-y-1.5">{findings.slice(0, 4).map((f, i) => <motion.div key={f.id} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="flex items-center gap-2 text-[11.5px]"><span className="h-5 w-1 flex-none rounded-full" style={{ background: SEV[f.severity].c }} /><span className="min-w-0 flex-1 truncate font-semibold">{f.title}</span><span className="mono flex-none" style={{ color: SEV[f.severity].c }}>{f.impactUsd ? usd(f.impactUsd, true) : '—'}</span></motion.div>)}</div>
        </BeamCard></Reveal>

        {/* Simulator */}
        <Reveal className="md:col-span-2"><BeamCard c="var(--emerald)" className="h-full p-5"><Head icon={SlidersHorizontal} c="var(--emerald)" t="What is fixing it worth?" /><MiniSimulator /></BeamCard></Reveal>

        {/* Ideas checked */}
        <Reveal className="md:col-span-3"><BeamCard c="var(--emerald)" className="h-full p-5"><Head icon={FlaskConical} c="var(--emerald)" t="Ideas, tested with statistics" />
          <div className="mt-3 space-y-1.5">{ideas.slice(0, 4).map((h, i) => <motion.div key={h.id} initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }} className="flex items-start gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--line)' }}>{h.verdict === 'supported' ? <Check size={13} className="mt-0.5 flex-none" style={{ color: VERDICT[h.verdict].c }} /> : <X size={13} className="mt-0.5 flex-none" style={{ color: VERDICT[h.verdict]?.c }} />}<span className="text-[11.5px] font-semibold">{h.claim} <span className="font-bold" style={{ color: VERDICT[h.verdict]?.c }}>· {VERDICT[h.verdict]?.label}</span></span></motion.div>)}</div>
          <div className="mt-2 flex items-center gap-1 text-[11.5px] text-[var(--faint)]"><Sparkles size={11} style={{ color: 'var(--fuchsia)' }} />AI can suggest new ideas; statistics check them against your data.</div>
        </BeamCard></Reveal>

        {/* Cleaning */}
        <Reveal className="md:col-span-3"><BeamCard c="var(--amber)" className="h-full p-5"><Head icon={Brush} c="var(--amber)" t="Cleans messy data first" />
          <div className="mt-3 grid grid-cols-2 gap-1.5">{prep ? [['Duplicates removed', prep.duplicateRows, 'var(--amber)'], ['Returns separated', prep.returnLines, 'var(--orange)'], ['Fees set aside', prep.feeLines, 'var(--cyan)'], ['No-customer sales flagged', prep.missingCustomerRows, 'var(--rose)']].map(([l, v, c]) => <div key={l as string} className="tint rounded-lg p-2" style={{ '--c': c } as CSSProperties}><div className="label">{l}</div><CountUp value={Number(v)} className="text-[17px] font-semibold" /></div>) : <div className="col-span-2 text-[12px] text-[var(--muted)]">Load the real case study to see its cleaning report.</div>}</div>
        </BeamCard></Reveal>

        {/* Shopify */}
        <Reveal className="md:col-span-2"><BeamCard c="var(--emerald)" className="h-full p-5"><Head icon={ShoppingBag} c="var(--emerald)" t="Plugs into Shopify" />
          <ol className="mt-3 space-y-1.5 text-[11.5px] text-[var(--muted)]">{['Connect your store (read-only)', 'Or drop in its order export', 'Or any CSV / Excel sales file'].map((s, i) => <li key={s} className="flex gap-2"><span className="mono grid h-4 w-4 flex-none place-items-center rounded text-[11px] font-bold text-white" style={{ background: 'var(--emerald)' }}>{i + 1}</span>{s}</li>)}</ol>
        </BeamCard></Reveal>

        {/* Report */}
        <Reveal className="md:col-span-4"><BeamCard c="var(--sky)" className="h-full p-5"><Head icon={FileText} c="var(--sky)" t="A one-page report to share" />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">{[{ w: '0–30 days', t: 'Quick wins', c: 'var(--rose)' }, { w: '30–90 days', t: 'Bigger fixes', c: 'var(--amber)' }, { w: '90–180 days', t: 'Long-term', c: 'var(--emerald)' }].map((p, i) => <motion.div key={p.w} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12 }} className="rounded-lg p-2.5" style={{ background: 'var(--line)', borderTop: `2px solid ${p.c}` }}><div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: p.c }}>{p.w}</div><div className="text-[12.5px] font-extrabold">{p.t}</div></motion.div>)}</div>
          <p className="mt-2 text-[11.5px] text-[var(--muted)]">Every topic checked, what was found, and a roadmap built from your actual fixes. Download as Markdown or PDF.</p>
        </BeamCard></Reveal>

        <Reveal className="md:col-span-6"><div className="flex flex-wrap items-center justify-center gap-2 pt-2">{Object.entries(CAT).map(([k, c]) => <span key={k} className="chip" style={{ '--c': c.c } as CSSProperties}>{c.label}</span>)}</div></Reveal>
        <Reveal className="md:col-span-6"><div className="text-center"><motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.04 }} className="btn btn-primary !h-11 !px-6 text-[13px]" onClick={() => openApp()}>Try every feature live</motion.button></div></Reveal>
      </section>
      <FinalCta />
    </>
  );
}

export { AnimatePresence };
