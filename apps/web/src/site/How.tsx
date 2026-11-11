import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { Bot, Brush, Calculator, FlaskConical, Layers, PlugZap, Search, Wrench } from 'lucide-react';
import { Reveal } from '../components/ui';
import { BeamCard } from './Effects';
import { RULES } from './content';
import { FinalCta } from './Home';

const PIPE = [
  { icon: PlugZap, t: 'Connect', c: 'var(--emerald)' }, { icon: Brush, t: 'Clean', c: 'var(--amber)' }, { icon: Search, t: 'Check', c: 'var(--cyan)' },
  { icon: Layers, t: 'Scan', c: 'var(--rose)' }, { icon: FlaskConical, t: 'Prove', c: 'var(--fuchsia)' }, { icon: Wrench, t: 'Act', c: 'var(--violet)' },
];

/** Animated pipeline: data packets travel left to right through each stage. */
function Pipeline() {
  return (
    <div className="relative">
      <svg className="absolute left-0 right-0 top-[27px] hidden h-2 w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 2" aria-hidden>
        <defs><linearGradient id="pipe" x1="0" x2="1"><stop offset="0" style={{ stopColor: 'var(--emerald)' }} /><stop offset="0.5" style={{ stopColor: 'var(--rose)' }} /><stop offset="1" style={{ stopColor: 'var(--violet)' }} /></linearGradient></defs>
        <line x1="8" y1="1" x2="92" y2="1" stroke="url(#pipe)" strokeWidth="0.35" opacity="0.6" />
      </svg>
      {[0, 1, 2].map((k) => (
        <motion.span key={k} className="absolute top-[24px] hidden h-2 w-2 rounded-full md:block" style={{ background: 'white', boxShadow: '0 0 12px 3px var(--cyan)' }} initial={{ left: '8%', opacity: 0 }} animate={{ left: ['8%', '92%'], opacity: [0, 1, 1, 0] }} transition={{ duration: 4, repeat: Infinity, delay: k * 1.33, ease: 'linear' }} />
      ))}
      <div className="relative grid grid-cols-3 gap-y-6 md:grid-cols-6">
        {PIPE.map((p, i) => (
          <motion.div key={p.t} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center">
            <motion.div whileHover={{ scale: 1.12, rotate: -6 }} className="relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: `color-mix(in srgb, ${p.c} 18%, var(--bg))`, border: `1px solid color-mix(in srgb, ${p.c} 50%, transparent)`, boxShadow: `0 0 24px -6px ${p.c}` }}><p.icon size={20} style={{ color: p.c }} /></motion.div>
            <div className="mt-2 text-[12.5px] font-extrabold">{p.t}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  { c: 'var(--emerald)', icon: PlugZap, t: 'Connect your sales', d: 'Link Shopify (read-only), drop in Shopify\'s order export, or upload any CSV, Excel or PDF sales report. No setup, no account.', ex: 'A store with 50,000 orders is ready in seconds.' },
  { c: 'var(--cyan)', icon: Search, t: 'Blindspot hunts for problems', d: 'It cleans the data, runs every check, scans every product, customer and country, and tests business ideas, all with real calculations.', ex: '1 million real sales analysed in about 6 seconds.' },
  { c: 'var(--violet)', icon: Wrench, t: 'You get a plan', d: 'Each problem comes with what it costs, how sure Blindspot is, what fixing it could be worth, and a roadmap ordered from easy to hard.', ex: 'Plus a one-page report to send a partner or investor.' },
];

const LAYERS = [
  { icon: Brush, c: 'var(--amber)', t: 'Cleans your data', d: 'Removes duplicate lines, separates returns and fees, flags sales with no customer, and shows exactly what changed.', ex: 'Found 34,335 duplicate lines in a real shop.' },
  { icon: Search, c: 'var(--cyan)', t: 'Checks what matters to shops', d: 'Returns, repeat buyers, lost customers, products that stopped selling, order size, seasonality, money-losing products.', ex: 'Found 42 best customers who had stopped ordering.' },
  { icon: Layers, c: 'var(--rose)', t: 'Scans everything else', d: 'Compares every product, customer and country with the business as a whole, so it catches problems nobody thought to check.', ex: 'A best-seller down 51% while the shop grew 5%.' },
  { icon: FlaskConical, c: 'var(--fuchsia)', t: 'Tests ideas with math', d: 'Business theories, built-in or suggested by AI, are tested and labeled true, false or not enough evidence.', ex: 'Proved growth was coming from old customers, not new ones.' },
];

export default function How() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 text-center md:px-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="label" style={{ color: 'var(--cyan)' }}>How it works</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="text-glow mx-auto mt-2 max-w-3xl text-[34px] font-extrabold leading-tight tracking-tight md:text-[48px]">From raw sales to <span className="grad-text">a plan you can act on.</span></motion.h1>
        <div className="mt-10"><Pipeline /></div>
      </section>

      <section className="mx-auto max-w-6xl space-y-3 px-4 pb-16 md:px-6">
        {STEPS.map((s, i) => (
          <Reveal key={s.t}><BeamCard c={s.c} className="grid items-center gap-4 p-5 md:grid-cols-[auto_1fr_auto]">
            <div className="flex items-center gap-3"><span className="mono text-[34px] font-semibold leading-none" style={{ color: s.c, textShadow: `0 0 20px ${s.c}` }}>0{i + 1}</span><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${s.c} 16%, transparent)` }}><s.icon size={18} style={{ color: s.c }} /></span></div>
            <div><div className="text-[17px] font-extrabold">{s.t}</div><p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{s.d}</p></div>
            <div className="chip !whitespace-normal !py-1.5 md:max-w-[220px]" style={{ '--c': s.c } as CSSProperties}>{s.ex}</div>
          </BeamCard></Reveal>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
        <Reveal><div className="label" style={{ color: 'var(--rose)' }}>Under the hood</div><h2 className="mt-1.5 text-[26px] font-extrabold tracking-tight md:text-[34px]">Four layers of analysis.</h2></Reveal>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {LAYERS.map((l, i) => (
            <Reveal key={l.t}><BeamCard c={l.c} className="h-full p-5">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${l.c} 16%, transparent)` }}><l.icon size={18} style={{ color: l.c }} /></span><div><div className="label">Layer {i + 1}</div><div className="text-[15px] font-extrabold">{l.t}</div></div></div>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{l.d}</p>
              <div className="mt-3 rounded-lg px-3 py-2 text-[11.5px]" style={{ background: 'var(--line)', borderLeft: `3px solid ${l.c}` }}><span className="font-bold" style={{ color: l.c }}>Real example: </span>{l.ex}</div>
            </BeamCard></Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
        <Reveal><div className="label" style={{ color: 'var(--emerald)' }}>The math</div><h2 className="mt-1.5 text-[26px] font-extrabold tracking-tight md:text-[34px]">Four rules so it never makes things up.</h2></Reveal>
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_1.1fr]">
          {RULES.slice(0, 2).map((r, i) => (
            <Reveal key={r.t}><BeamCard c={['var(--cyan)', 'var(--rose)'][i]} className="h-full p-5"><Calculator size={18} style={{ color: ['var(--cyan)', 'var(--rose)'][i] }} /><div className="mt-2 text-[14px] font-extrabold">{r.t}</div><p className="mt-1 text-[12.5px] text-[var(--muted)]">{r.d}</p></BeamCard></Reveal>
          ))}
          <Reveal className="md:row-span-2"><BeamCard on c="var(--fuchsia)" className="h-full p-5">
            <Bot size={18} style={{ color: 'var(--fuchsia)' }} />
            <div className="mt-2 text-[14px] font-extrabold">Where the AI fits</div>
            <p className="mt-1 text-[12.5px] text-[var(--muted)]">The analysis itself is pure math: free, instant, and the same every time. The AI does the human part:</p>
            <ul className="mt-3 space-y-2 text-[12.5px]">
              {['Answers your questions in plain English', 'Suggests new ideas worth testing', 'Reviews dashboard screenshots'].map((t, i) => <motion.li key={t} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--fuchsia)', boxShadow: '0 0 8px var(--fuchsia)' }} />{t}</motion.li>)}
            </ul>
            <div className="mt-4 rounded-lg px-3 py-2 text-[11.5px]" style={{ background: 'var(--line)' }}>Every AI idea is tested by code before you see it. If the numbers don't back it up, it's labeled false or not enough evidence.</div>
          </BeamCard></Reveal>
          {RULES.slice(2).map((r, i) => (
            <Reveal key={r.t}><BeamCard c={['var(--emerald)', 'var(--amber)'][i]} className="h-full p-5"><Calculator size={18} style={{ color: ['var(--emerald)', 'var(--amber)'][i] }} /><div className="mt-2 text-[14px] font-extrabold">{r.t}</div><p className="mt-1 text-[12.5px] text-[var(--muted)]">{r.d}</p></BeamCard></Reveal>
          ))}
        </div>
      </section>
      <FinalCta />
    </>
  );
}
