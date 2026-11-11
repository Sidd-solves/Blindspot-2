import { motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import { BadgeCheck, Check, Database, Globe2, X } from 'lucide-react';
import { CAT, SEV, tool, usd } from '../api';
import { useStore } from '../store';
import { CountUp, Reveal } from '../components/ui';
import { BeamCard } from './Effects';
import { FinalCta } from './Home';

// Verified on the FULL dataset (1,067,371 rows) by an independent Python script: docs/FACT_CHECK.md
const FACTS = [
  ['Exact duplicate lines', '34,335', '34,335'],
  ['Returned / cancelled value', '£716,426 (3.6%)', '£716,426 (3.6%)'],
  ['Sales with no customer attached', '13.1%', '13.1%'],
  ['First order vs repeat order', '£407 vs £478', '£407 vs £478'],
  ['UK vs international order', '£428 vs £860', '£428 vs £860'],
  ['Best-selling cake stand vs whole shop', '−50.9% vs +10.4%', '−50.9% vs +10.4%'],
];

export default function Results() {
  const { findings, dataset } = useStore();
  const [ideas, setIdeas] = useState<any[]>([]);
  useEffect(() => { tool('test-hypotheses', { useAI: false }).then((r) => r.ok && setIdeas(r.data.results)); }, [dataset?.name]);
  const real = dataset?.source === 'case-study';

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-10 md:px-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="label" style={{ color: 'var(--emerald)' }}>Real results</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="text-glow mt-2 max-w-3xl text-[34px] font-extrabold leading-tight tracking-tight md:text-[48px]">We tested Blindspot on <span className="grad-text">1 million real sales.</span></motion.h1>
        <div className="mt-6 grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <Reveal><BeamCard on c="var(--violet)" className="h-full p-5">
            <div className="flex items-center gap-2"><Globe2 size={16} style={{ color: 'var(--violet)' }} /><span className="text-[14px] font-extrabold">The shop</span></div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">A real UK online gift shop, two years of sales (Dec 2009 to Dec 2011), with customers in 43 countries. The data is messy the way real shops are: returns, duplicates, fees and missing customers.</p>
            <div className="mt-2 text-[10.5px] text-[var(--faint)]">Source: UCI Machine Learning Repository, "Online Retail II" (Chen, 2012), CC BY 4.0. Names removed by the publisher.</div>
          </BeamCard></Reveal>
          <Reveal><div className="grid h-full grid-cols-2 gap-2">
            {[{ l: 'Sales lines', v: 1067371, c: 'var(--cyan)' }, { l: 'Countries', v: 43, c: 'var(--blue)' }, { l: 'Problems found', v: findings.length, c: 'var(--rose)' }, { l: 'Seconds to analyse', v: 6, c: 'var(--emerald)' }].map((s) => (
              <div key={s.l} className="tint rounded-xl p-3" style={{ '--c': s.c } as CSSProperties}><div className="label">{s.l}</div><CountUp value={s.v} className="text-[22px] font-semibold" duration={1.6} /></div>
            ))}
          </div></Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 md:px-6">
        <Reveal><h2 className="text-[24px] font-extrabold tracking-tight md:text-[30px]">What it found</h2>{real && <p className="mt-1 text-[12px] text-[var(--muted)]">Live from the demo, which runs on a 25% random sample of the shop's customers, so money totals are about a quarter of the full data.</p>}</Reveal>
        <div className="mt-5 grid gap-2.5 md:grid-cols-2">
          {findings.slice(0, 8).map((f, i) => (
            <Reveal key={f.id}><BeamCard c={SEV[f.severity].c} className="h-full p-4">
              <div className="flex items-center justify-between gap-2"><span className="chip" style={{ '--c': CAT[f.category]?.c } as CSSProperties}>{CAT[f.category]?.label}</span>{f.impactUsd ? <span className="mono text-[12px] font-semibold" style={{ color: SEV[f.severity].c }}>{usd(f.impactUsd, true)}</span> : null}</div>
              <div className="mt-2 text-[13.5px] font-extrabold leading-snug">{f.title}</div>
              <div className="mt-1 text-[12px] text-[var(--muted)]"><span className="font-bold" style={{ color: 'var(--emerald)' }}>Fix: </span>{f.nextAction}</div>
              <motion.div className="mt-3 h-[2px] origin-left rounded-full" style={{ background: SEV[f.severity].c, boxShadow: `0 0 10px ${SEV[f.severity].c}` }} initial={{ scaleX: 0 }} whileInView={{ scaleX: f.confidence }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.05 }} />
              <div className="mt-1 text-[10px] text-[var(--faint)]">{Math.round(f.confidence * 100)}% confidence</div>
            </BeamCard></Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-3 px-4 pb-16 md:grid-cols-2 md:px-6">
        <Reveal><BeamCard c="var(--emerald)" className="h-full p-5">
          <div className="flex items-center gap-2"><BadgeCheck size={16} style={{ color: 'var(--emerald)' }} /><span className="text-[14px] font-extrabold">Fact-checked</span></div>
          <p className="mt-1 text-[12px] text-[var(--muted)]">Every headline number was recalculated by separate code. All match exactly, on the full million rows.</p>
          <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--line)' }}>
            <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--faint)]" style={{ background: 'var(--line)' }}><span>Number</span><span>Blindspot</span><span>Re-check</span><span /></div>
            {FACTS.map(([n, a, b], i) => (
              <motion.div key={n} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-2 border-t px-3 py-1.5 text-[11.5px]" style={{ borderColor: 'var(--line)' }}>
                <span className="font-semibold">{n}</span><span className="mono">{a}</span><span className="mono">{b}</span><Check size={13} style={{ color: 'var(--emerald)' }} />
              </motion.div>
            ))}
          </div>
        </BeamCard></Reveal>
        <Reveal><BeamCard c="var(--fuchsia)" className="h-full p-5">
          <div className="flex items-center gap-2"><Database size={16} style={{ color: 'var(--fuchsia)' }} /><span className="text-[14px] font-extrabold">Ideas it proved true or false</span></div>
          <div className="mt-3 space-y-1.5">{ideas.map((h, i) => (
            <motion.div key={h.id} initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="rounded-lg px-3 py-2" style={{ background: 'var(--line)', borderLeft: `3px solid ${h.verdict === 'supported' ? 'var(--emerald)' : h.verdict === 'rejected' ? 'var(--rose)' : 'var(--faint)'}` }}>
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: h.verdict === 'supported' ? 'var(--emerald)' : h.verdict === 'rejected' ? 'var(--rose)' : 'var(--faint)' }}>{h.verdict === 'supported' ? <><Check size={11} />True</> : h.verdict === 'rejected' ? <><X size={11} />False</> : 'Not enough evidence'}</div>
              <div className="text-[12px] font-bold">{h.claim}</div><div className="text-[11px] text-[var(--muted)]">{h.summary}</div>
            </motion.div>
          ))}</div>
        </BeamCard></Reveal>
      </section>
      <FinalCta />
    </>
  );
}
