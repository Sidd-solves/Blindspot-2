import { motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, BadgeCheck, Check, Eye, PlugZap, Search, ShoppingBag, Sparkles, Wrench, X } from 'lucide-react';
import { CAT, SEV, tool, usd, VERDICT } from '../api';
import { useStore } from '../store';
import { CountUp, Reveal, Ring } from '../components/ui';
import { Aurora, BeamCard, Marquee } from './Effects';
import { CATCHES } from './content';
import { openApp, siteGo } from './SiteLayout';
import { useOpenSample } from './Start';

export function useHealth() {
  const { findings } = useStore();
  const P: Record<string, number> = { critical: 20, high: 10, medium: 5, low: 1 };
  return Math.max(0, Math.round(100 - findings.reduce((s, f) => s + (P[f.severity] ?? 1) * f.confidence, 0)));
}

/** The live product, framed like a device, with a scanning beam sweeping over real findings. */
export function LivePreview() {
  const { findings, dataset } = useStore();
  const health = useHealth();
  return (
    <BeamCard on c="var(--cyan)" className="relative overflow-hidden p-4">
      <div className="scanline" />
      <div className="flex items-center gap-1.5 pb-3"><span className="h-2 w-2 rounded-full bg-[#fb7185]" /><span className="h-2 w-2 rounded-full bg-[#fbbf24]" /><span className="h-2 w-2 rounded-full bg-[#34d399]" /><span className="mono ml-2 truncate text-[10px] text-[var(--faint)]">blindspot · analysing {dataset?.rows.toLocaleString() ?? '…'} sales</span></div>
      <div className="flex items-center justify-between">
        <div className="min-w-0"><div className="label flex items-center gap-1"><span className="pulse-dot" style={{ '--c': 'var(--emerald)', width: 6, height: 6 } as CSSProperties} />{dataset?.source === 'case-study' ? 'Live · real UK online shop' : 'Live analysis'}</div><div className="truncate text-[13px] font-extrabold">{dataset?.name ?? 'Loading…'}</div></div>
        <Ring value={health / 100} size={60} stroke={6} c={health >= 60 ? 'var(--cyan)' : health >= 40 ? 'var(--amber)' : 'var(--rose)'}><div className="text-center"><div className="mono text-[14px] font-semibold leading-none">{health}</div><div className="text-[7.5px] font-bold uppercase text-[var(--faint)]">health</div></div></Ring>
      </div>
      <div className="mt-3 space-y-1.5">
        {findings.slice(0, 5).map((f, i) => (
          <motion.div key={f.id} initial={{ opacity: 0, x: 18, filter: 'blur(4px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} transition={{ delay: 0.6 + i * 0.22 }} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5" style={{ background: 'color-mix(in srgb, var(--panel-solid) 70%, transparent)', border: '1px solid var(--line)' }}>
            <span className="h-6 w-1 flex-none rounded-full" style={{ background: SEV[f.severity].c, boxShadow: `0 0 10px ${SEV[f.severity].c}` }} />
            <div className="min-w-0 flex-1"><div className="truncate text-[11.5px] font-bold">{f.title}</div><div className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: CAT[f.category]?.c }}>{CAT[f.category]?.label}</div></div>
            {f.impactUsd ? <span className="mono flex-none text-[10.5px] font-semibold" style={{ color: SEV[f.severity].c }}>{usd(f.impactUsd, true)}</span> : null}
          </motion.div>
        ))}
        {!findings.length && [0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-10" />)}
      </div>
    </BeamCard>
  );
}

export default function Home() {
  const sample = useOpenSample();
  const { findings, dataset } = useStore();
  const [ideas, setIdeas] = useState<any[]>([]);
  useEffect(() => { tool('test-hypotheses', { useAI: false }).then((r) => r.ok && setIdeas(r.data.results)); }, [dataset?.name]);
  const decided = ideas.filter((h) => h.verdict !== 'inconclusive');
  const hero = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]), fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const words = ['See', 'what', 'your', 'sales', 'data', 'is'];

  return (
    <>
      {/* Hero */}
      <section ref={hero} className="relative -mt-20 overflow-hidden pt-28">
        <Aurora />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(transparent, var(--bg))' }} />
        <motion.div style={{ y, opacity: fade }} className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 md:grid-cols-[1.1fr_1fr] md:px-6 md:pb-24">
          <div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="chip !py-1" style={{ '--c': 'var(--violet)' } as CSSProperties}><Sparkles size={11} />The AI analyst for small businesses</motion.div>
            <h1 className="text-glow mt-5 text-[40px] font-extrabold leading-[1.02] tracking-tight md:text-[60px]">
              {words.map((w, i) => <motion.span key={w + i} initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.1 + i * 0.07 }} className="mr-[0.25em] inline-block">{w}</motion.span>)}
              <motion.span initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.6 }} className="grad-text inline-block">hiding.</motion.span>
            </h1>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }} className="mt-5 max-w-lg text-[14.5px] leading-relaxed text-[var(--muted)]">
              Connect your Shopify store or drop in a spreadsheet. Blindspot finds what's quietly costing you money, proves it with real numbers, and tells you what to fix first. In seconds.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 }} className="mt-7 flex flex-wrap gap-2">
              <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }} className="btn btn-primary !h-11 !px-5 text-[13px]" onClick={() => sample.open('overview')}><Eye size={15} />See it on a real shop</motion.button>
              <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }} className="btn !h-11 !px-5 text-[13px]" onClick={() => openApp()}><ShoppingBag size={15} style={{ color: 'var(--emerald)' }} />Connect your store</motion.button>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-5 flex flex-wrap gap-4 text-[11.5px] text-[var(--muted)]">
              {['Free to try', 'No account needed', 'Read-only access'].map((t) => <span key={t} className="flex items-center gap-1"><Check size={12} style={{ color: 'var(--emerald)' }} />{t}</span>)}
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 140, damping: 20 }}>
            <LivePreview />
          </motion.div>
        </motion.div>
      </section>

      {/* Marquee */}
      <section className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="label mb-2 text-center">Nine kinds of blind spots, checked every time</div>
        <Marquee items={CATCHES.map((c) => ({ t: c.t, c: CAT[c.k].c }))} />
      </section>

      {/* Problem: bento with varied shapes */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <Reveal><div className="label" style={{ color: 'var(--rose)' }}>The problem</div><h2 className="mt-1.5 max-w-2xl text-[26px] font-extrabold leading-tight tracking-tight md:text-[34px]">Small shops run on gut feeling. The expensive problems hide in plain sight.</h2></Reveal>
        <div className="mt-6 grid gap-3 md:grid-cols-3 md:grid-rows-2">
          <Reveal className="md:row-span-2"><BeamCard c="var(--rose)" className="flex h-full flex-col justify-between p-5">
            <div><div className="text-[18px] font-extrabold">Dashboards show what happened.</div><p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">A chart of sales going up feels good. It won't tell you your best customer stopped ordering last month.</p></div>
            <div className="mt-6 flex h-24 items-end gap-1.5">{[38, 46, 41, 55, 62, 58, 70, 76, 81, 88].map((h, i) => <motion.div key={i} className="flex-1 rounded-t" style={{ background: i === 7 ? 'var(--rose)' : 'color-mix(in srgb, var(--violet) 55%, transparent)', boxShadow: i === 7 ? '0 0 16px var(--rose)' : 'none' }} initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ delay: i * 0.06, type: 'spring' }} />)}</div>
            <div className="mt-2 text-[10.5px] text-[var(--faint)]">Total keeps rising… while one key account quietly disappears.</div>
          </BeamCard></Reveal>
          <Reveal className="md:col-span-2"><BeamCard c="var(--amber)" className="h-full p-5"><div className="text-[16px] font-extrabold">Analysts are for big companies.</div><p className="mt-1.5 text-[13px] text-[var(--muted)]">Large retailers pay data teams to hunt for these problems every week. A small shop gets a spreadsheet and a hunch.</p></BeamCard></Reveal>
          <Reveal className="md:col-span-2"><BeamCard c="var(--violet)" className="h-full p-5"><div className="text-[16px] font-extrabold">The costly problems are quiet.</div><p className="mt-1.5 text-[13px] text-[var(--muted)]">Returns, lost customers and products that stopped selling don't announce themselves. They just slowly drain money.</p></BeamCard></Reveal>
        </div>
      </section>

      {/* Steps teaser */}
      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
        <Reveal><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="label" style={{ color: 'var(--cyan)' }}>How it works</div><h2 className="mt-1.5 text-[26px] font-extrabold tracking-tight md:text-[34px]">Connect. Find. Fix.</h2></div><button className="btn" onClick={() => siteGo('how')}>See how it works<ArrowRight size={13} /></button></div></Reveal>
        <div className="relative mt-8 grid gap-4 md:grid-cols-3">
          <motion.div className="absolute left-[16%] right-[16%] top-[26px] hidden h-[2px] origin-left md:block" style={{ background: 'linear-gradient(90deg, var(--emerald), var(--cyan), var(--violet))', boxShadow: '0 0 12px var(--cyan)' }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.3 }} />
          {[{ icon: PlugZap, c: 'var(--emerald)', t: 'Connect', d: 'Shopify, its order export, or any sales spreadsheet.' }, { icon: Search, c: 'var(--cyan)', t: 'Find', d: 'Cleans the data and hunts for problems, testing each one.' }, { icon: Wrench, c: 'var(--violet)', t: 'Fix', d: 'What each problem costs, and a plan from easy to hard.' }].map((s, i) => (
            <Reveal key={s.t}><div className="text-center"><motion.div whileHover={{ scale: 1.1, rotate: -6 }} className="relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: s.c, boxShadow: `0 0 0 6px var(--bg), 0 0 30px -4px ${s.c}` }}><s.icon size={22} color="white" /></motion.div><div className="mt-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: s.c }}>Step {i + 1}</div><div className="text-[16px] font-extrabold">{s.t}</div><p className="mx-auto mt-1 max-w-xs text-[12.5px] text-[var(--muted)]">{s.d}</p></div></Reveal>
          ))}
        </div>
      </section>

      {/* Real results strip */}
      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
        <Reveal><BeamCard on c="var(--emerald)" className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="label" style={{ color: 'var(--emerald)' }}>Real results</div><div className="mt-1 text-[20px] font-extrabold tracking-tight md:text-[24px]">Tested on a real online shop's sales.</div></div><span className="chip" style={{ '--c': 'var(--emerald)' } as CSSProperties}><BadgeCheck size={11} />Every number independently re-checked</span></div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[{ l: 'Sales lines analysed', v: dataset?.rows ?? 0, c: 'var(--cyan)' }, { l: 'Problems found', v: findings.length, c: 'var(--rose)' }, { l: 'Ideas proven true or false', v: decided.length, c: 'var(--emerald)' }, { l: 'Seconds to analyse', v: 2, c: 'var(--violet)' }].map((s) => (
              <div key={s.l} className="tint rounded-xl p-3" style={{ '--c': s.c } as CSSProperties}><div className="label">{s.l}</div><CountUp value={s.v} className="text-[24px] font-semibold" duration={1.6} /></div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {decided.slice(0, 4).map((h, i) => (
              <motion.div key={h.id} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--line)' }}>
                {h.verdict === 'supported' ? <Check size={14} className="mt-0.5 flex-none" style={{ color: VERDICT[h.verdict].c }} /> : <X size={14} className="mt-0.5 flex-none" style={{ color: VERDICT[h.verdict]?.c }} />}
                <div><div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: VERDICT[h.verdict]?.c }}>{VERDICT[h.verdict]?.label}</div><div className="text-[12.5px] font-bold">{h.claim}</div><div className="text-[11px] text-[var(--muted)]">{h.summary}</div></div>
              </motion.div>
            ))}
          </div>
          <button className="btn mt-4" onClick={() => siteGo('results')}>See all real results<ArrowRight size={13} /></button>
        </BeamCard></Reveal>
      </section>

      <FinalCta />
    </>
  );
}

export function FinalCta() {
  const sample = useOpenSample();
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
      <Reveal><div className="relative overflow-hidden rounded-3xl border p-10 text-center" style={{ borderColor: 'var(--line)' }}>
        <Aurora />
        <div className="relative">
          <h2 className="text-glow text-[28px] font-extrabold leading-tight tracking-tight md:text-[40px]">Dashboards show what happened.<br /><span className="grad-text">Blindspot shows what you're missing.</span></h2>
          <p className="mt-3 text-[13px] text-[var(--muted)]">Built by a Shopify store owner, for store owners.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.04 }} className="btn btn-primary !h-11 !px-6 text-[13px]" onClick={() => sample.open('overview')}><Eye size={15} />See it on a real shop</motion.button>
            <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.04 }} className="btn !h-11 !px-6 text-[13px]" onClick={() => openApp()}><ShoppingBag size={15} style={{ color: 'var(--emerald)' }} />Connect your store</motion.button>
          </div>
        </div>
      </div></Reveal>
    </section>
  );
}
