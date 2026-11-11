import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CountUp } from '../components/ui';
import { Marquee } from './Effects';
import {
  BadgeCheck,
  BellRing,
  Camera,
  FileSpreadsheet,
  FileText,
  Gavel,
  LineChart,
  PackageX,
  Sparkles,
  Table2,
  Wand2,
} from 'lucide-react';

/** A button that leans toward the cursor. */
export function Magnetic({
  children,
  className = '',
  style,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const x = useMotionValue(0),
    y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16 }),
    sy = useSpring(y, { stiffness: 220, damping: 16 });
  return (
    <motion.button
      onClick={onClick}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.25);
        y.set((e.clientY - r.top - r.height / 2) * 0.35);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.96 }}
      style={{ x: sx, y: sy, ...style }}
      className={className}
    >
      {children}
    </motion.button>
  );
}

/** Headline words rising out of a mask, one after another. */
export function KineticTitle({ lines, className = '' }: { lines: ReactNode[][]; className?: string }) {
  let k = 0;
  return (
    <h1 className={className}>
      {lines.map((words, li) => (
        <span key={li} className="block">
          {words.map((w, wi) => {
            const i = k++;
            return (
              <span
                key={wi}
                className="-mx-[0.2em] -mb-[0.28em] -mt-[0.1em] inline-block overflow-hidden px-[0.2em] pb-[0.28em] pt-[0.1em] align-bottom"
              >
                <motion.span
                  className="inline-block"
                  initial={{ y: '110%', rotate: 4 }}
                  animate={{ y: 0, rotate: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                  {w}
                </motion.span>
                {wi < words.length - 1 ? ' ' : ''}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

// ---------- Pinned story: four steps while one screen stays put ----------

const STEPS = [
  { t: 'Drop in any export', d: 'CSV, Excel, PDF reports, even a photo of a printout.', c: 'var(--cyan)' },
  {
    t: '40 checks run in seconds',
    d: 'Customers, products, returns, seasons, gaps. Ranked by money.',
    c: 'var(--violet)',
  },
  {
    t: 'Every amount traced to its rows',
    d: 'Open any finding and replay it to the penny.',
    c: 'var(--emerald)',
  },
  {
    t: 'AI writes. The engine checks.',
    d: 'Each figure Claude writes is matched against the analysis.',
    c: 'var(--fuchsia)',
  },
];

function StepVisual({ i }: { i: number }) {
  const files = [
    { n: 'orders_2024.csv', ic: FileSpreadsheet, c: 'var(--emerald)' },
    { n: 'sales-report.pdf', ic: FileText, c: 'var(--sky)' },
    { n: 'shopify_export.xlsx', ic: Table2, c: 'var(--violet)' },
    { n: 'printout.jpg', ic: Camera, c: 'var(--fuchsia)' },
  ];
  const finds = [
    { t: '10 best customers stopped ordering', v: '£93,531', c: 'var(--amber)' },
    { t: 'New customers reorder less', v: '51% → 42%', c: 'var(--violet)' },
    { t: '23 products stopped selling', v: '£36,302', c: 'var(--orange)' },
    { t: '509 orders reversed within 2 days', v: '£114,284', c: 'var(--sky)' },
  ];
  return (
    <div className="grid [&>*]:[grid-area:1/1]">
      <AnimatePresence initial={false}>
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 14, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.985 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="panel relative w-full overflow-hidden p-4"
          style={{
            backdropFilter: 'blur(18px)',
            background: 'color-mix(in srgb, var(--panel) 78%, transparent)',
          }}
        >
          {i === 0 && (
            <div>
              <motion.div
                className="grid place-items-center rounded-xl border-2 border-dashed py-6 text-[12.5px] text-[var(--muted)]"
                style={{ borderColor: 'color-mix(in srgb, var(--cyan) 55%, var(--line))' }}
                animate={{
                  borderColor: [
                    'color-mix(in srgb, var(--cyan) 55%, var(--line))',
                    'color-mix(in srgb, var(--violet) 55%, var(--line))',
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse' }}
              >
                Drop files here
              </motion.div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {files.map((f, k) => (
                  <motion.div
                    key={f.n}
                    initial={{ opacity: 0, y: -40, rotate: k % 2 ? 8 : -8 }}
                    animate={{ opacity: 1, y: 0, rotate: 0 }}
                    transition={{ delay: k * 0.04, type: 'spring', stiffness: 420, damping: 26 }}
                    className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11.5px]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <f.ic size={14} style={{ color: f.c }} />
                    <span className="truncate">{f.n}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          {i === 1 && (
            <div className="space-y-1.5">
              {finds.map((f, k) => (
                <motion.div
                  key={f.t}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: k * 0.035, duration: 0.2 }}
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px]"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: f.c, boxShadow: `0 0 8px ${f.c}` }}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{f.t}</span>
                  <span className="mono" style={{ color: f.c }}>
                    {f.v}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
          {i === 2 && (
            <div>
              <div className="grid grid-cols-[1fr_auto] gap-x-3 text-[11px] text-[var(--faint)]">
                <span>customer · order date</span>
                <span>sales</span>
              </div>
              {[
                ['15749 · 18 Apr 2011', '£37,994.90'],
                ['16180 · 31 Aug 2011', '£10,254.18'],
                ['13027 · 18 Aug 2011', '£9,912.00'],
                ['17504 · 17 May 2011', '£7,096.33'],
              ].map(([a, b], k) => (
                <motion.div
                  key={a}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: k * 0.03, duration: 0.15 }}
                  className="mono grid grid-cols-[1fr_auto] gap-x-3 border-b py-1 text-[11.5px]"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <span>{a}</span>
                  <span>{b}</span>
                </motion.div>
              ))}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.12, type: 'spring', stiffness: 420, damping: 22 }}
                className="mt-3 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-bold"
                style={{
                  background: 'color-mix(in srgb, var(--emerald) 16%, transparent)',
                  color: 'var(--emerald)',
                }}
              >
                <BadgeCheck size={15} /> £93,531.25 · matches the finding to the penny
              </motion.div>
            </div>
          )}
          {i === 3 && (
            <div className="text-[12.5px] leading-relaxed">
              <div
                className="flex items-center gap-1.5 text-[11px] font-bold"
                style={{ color: 'var(--fuchsia)' }}
              >
                <Sparkles size={12} /> AI Analyst
              </div>
              <p className="mt-1">
                10 of your best customers went quiet, worth{' '}
                <span
                  className="rounded px-0.5 font-semibold"
                  style={{
                    textDecoration: 'underline solid var(--emerald)',
                    textUnderlineOffset: 3,
                    background: 'color-mix(in srgb, var(--emerald) 12%, transparent)',
                  }}
                >
                  £93,531
                </span>{' '}
                a year. Only{' '}
                <span
                  className="rounded px-0.5 font-semibold"
                  style={{
                    textDecoration: 'underline solid var(--emerald)',
                    textUnderlineOffset: 3,
                    background: 'color-mix(in srgb, var(--emerald) 12%, transparent)',
                  }}
                >
                  42%
                </span>{' '}
                of new customers reorder within 90 days, down from{' '}
                <span
                  className="rounded px-0.5 font-semibold"
                  style={{
                    textDecoration: 'underline solid var(--emerald)',
                    textUnderlineOffset: 3,
                    background: 'color-mix(in srgb, var(--emerald) 12%, transparent)',
                  }}
                >
                  51%
                </span>
                .
              </p>
              <div
                className="mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px]"
                style={{ borderColor: 'var(--line)' }}
              >
                <BadgeCheck size={12} style={{ color: 'var(--emerald)' }} />
                <b>12 of 12</b> figures match the analysis engine
                <span className="relative ml-auto h-1.5 w-16 overflow-hidden rounded-full bg-[var(--line)]">
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ background: 'var(--emerald)' }}
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1 }}
                  />
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                <Wand2 size={11} style={{ color: 'var(--fuchsia)' }} /> Wrong figures are sent back to the AI
                to fix before you see them.
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const STATS: { v: number; f?: (n: number) => string; l: string }[][] = [
  [
    { v: 5, l: 'file types: CSV, Excel, PDF, Numbers, photo' },
    { v: 261658, l: 'rows read from the real demo shop' },
    { v: 0, f: () => 'Read-only', l: 'nothing is changed in your store' },
  ],
  [
    { v: 10, l: 'areas checked when the data allows' },
    { v: 40, l: 'analysis tools behind the checks' },
    { v: 93531, f: (n) => `£${Math.round(n).toLocaleString()}`, l: 'top finding, ranked by money' },
  ],
  [
    { v: 10, l: 'customers behind the top finding' },
    { v: 1532, l: 'rows it was calculated from' },
    { v: 0, f: (n) => `£${n.toFixed(2)}`, l: 'difference from the finding' },
  ],
  [
    { v: 12, f: (n) => `${Math.round(n)} / 12`, l: 'figures matched in a real AI briefing' },
    { v: 1, l: 'round of self-correction if one is wrong' },
    { v: 0, f: () => 'Claude', l: 'writes the words; the engine does the math' },
  ],
];
const STEP_ICONS = [FileSpreadsheet, Table2, BadgeCheck, Sparkles];
const STEP_NAMES = ['upload.review', 'findings.ranked', 'rows.replay', 'analyst.factcheck'];
const SHORT = ['Drop in a file', '40 checks run', 'Traced to rows', 'AI, fact-checked'];

export function PinnedStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(Math.min(3, Math.floor(v * 4))));
  const bar = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  const lineW = useTransform(scrollYProgress, (p) => `calc((100% - 48px) * ${Math.min(1, p * 1.08)})`);
  return (
    <section ref={ref} className="relative h-[340vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center gap-8 py-20">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 md:grid-cols-2 md:px-6">
          <div>
            <div className="label" style={{ color: STEPS[step].c }}>
              How it works
            </div>
            <div className="mt-3 space-y-3">
              {STEPS.map((s, k) => (
                <motion.div
                  key={s.t}
                  animate={{ opacity: k === step ? 1 : 0.32, x: k === step ? 6 : 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                  className="flex gap-3"
                >
                  <span
                    className="mono mt-1 text-[12px]"
                    style={{ color: k === step ? s.c : 'var(--faint)' }}
                  >
                    0{k + 1}
                  </span>
                  <span>
                    <span className="block text-[22px] font-extrabold leading-tight tracking-tight md:text-[28px]">
                      {s.t}
                    </span>
                    <AnimatePresence>
                      {k === step && (
                        <motion.span
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="block text-[13.5px] text-[var(--muted)]"
                        >
                          {s.d}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                </motion.div>
              ))}
            </div>
            <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-[var(--line)]">
              <motion.div
                className="h-full rounded-full"
                style={{
                  width: bar,
                  background: `linear-gradient(90deg, var(--cyan), var(--violet), var(--emerald), var(--fuchsia))`,
                }}
              />
            </div>
          </div>
          <div>
            {/* product window */}
            <div
              className="flex items-center gap-1.5 rounded-t-xl border border-b-0 px-3 py-2"
              style={{
                borderColor: 'var(--line)',
                background: 'color-mix(in srgb, var(--panel) 85%, transparent)',
                backdropFilter: 'blur(18px)',
              }}
            >
              {['#fb7185', '#fbbf24', '#34d399'].map((c) => (
                <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
              ))}
              <AnimatePresence mode="wait">
                <motion.span
                  key={step}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="mono ml-2 text-[11px] text-[var(--faint)]"
                >
                  blindspot / {STEP_NAMES[step]}
                </motion.span>
              </AnimatePresence>
              <motion.span
                className="ml-auto flex items-center gap-1 text-[10.5px] font-bold"
                style={{ color: STEPS[step].c }}
                animate={{ opacity: [1, 0.45, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: STEPS[step].c }} /> live
              </motion.span>
            </div>
            <div className="[&>div]:rounded-t-none">
              <StepVisual i={step} />
            </div>
            {/* live numbers for this step */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {STATS[step].map((x, k) => (
                <motion.div
                  key={`${step}-${k}`}
                  initial={{ opacity: 0, y: 14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: k * 0.04, type: 'spring', stiffness: 420, damping: 28 }}
                  className="panel px-2.5 py-2"
                  style={{
                    backdropFilter: 'blur(18px)',
                    background: 'color-mix(in srgb, var(--panel) 70%, transparent)',
                  }}
                >
                  <div className="mono text-[17px] font-semibold" style={{ color: STEPS[step].c }}>
                    {x.f && x.v === 0 ? x.f(0) : <CountUp value={x.v} format={x.f} duration={0.9} />}
                  </div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--muted)]">{x.l}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
        {/* the pipeline: four steps joined by a line, with a pulse travelling as you scroll */}
        <div className="mx-auto hidden w-full max-w-6xl px-4 md:block md:px-6">
          <div className="relative flex items-center justify-between">
            <div className="absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-[var(--line)]" />
            <motion.div
              className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full"
              style={{
                left: 24,
                width: lineW,
                background:
                  'linear-gradient(90deg, var(--cyan), var(--violet), var(--emerald), var(--fuchsia))',
                boxShadow: '0 0 12px var(--violet)',
              }}
            />
            {STEPS.map((s, k) => {
              const Ic = STEP_ICONS[k];
              const on = k <= step;
              return (
                <div key={s.t} className="relative z-10 flex flex-col items-center gap-1.5">
                  <motion.span
                    animate={{
                      scale: k === step ? 1.15 : 1,
                      background: on
                        ? `color-mix(in srgb, ${s.c} 26%, var(--panel-solid))`
                        : 'var(--panel-solid)',
                      boxShadow: k === step ? `0 0 22px ${s.c}` : '0 0 0 transparent',
                    }}
                    className="grid h-11 w-11 place-items-center rounded-xl border"
                    style={{ borderColor: on ? s.c : 'var(--line)', color: on ? s.c : 'var(--faint)' }}
                  >
                    <Ic size={18} />
                  </motion.span>
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: k === step ? 'var(--text)' : 'var(--faint)' }}
                  >
                    {SHORT[k]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Horizontal gallery: vertical scroll moves the cards sideways ----------

const CARDS = [
  {
    t: 'Sales forecast',
    d: 'Replayed on past months before you see it, with its real miss rate.',
    ic: LineChart,
    c: 'var(--cyan)',
    v: 'spark',
  },
  {
    t: 'Customer Radar',
    d: 'Regulars going quiet, ranked by what they spend.',
    ic: BellRing,
    c: 'var(--amber)',
    v: 'dots',
  },
  {
    t: 'Unusual sales gaps',
    d: 'Products that stopped selling for weeks, then came back.',
    ic: PackageX,
    c: 'var(--orange)',
    v: 'gap',
  },
  {
    t: 'Prove it',
    d: 'Type a belief about your shop. Get a tested verdict.',
    ic: Gavel,
    c: 'var(--lime)',
    v: 'scale',
  },
  {
    t: 'Photo import',
    d: 'Snap a printed report. AI turns it into a table you can check.',
    ic: Camera,
    c: 'var(--fuchsia)',
    v: 'photo',
  },
  {
    t: 'AI briefing',
    d: 'A 30-second summary, every figure fact-checked.',
    ic: Sparkles,
    c: 'var(--violet)',
    v: 'lines',
  },
] as const;

function CardVisual({ v, c }: { v: string; c: string }) {
  const draw = {
    initial: { pathLength: 0 },
    whileInView: { pathLength: 1 },
    viewport: { once: true },
    transition: { duration: 1.4 },
  };
  return (
    <svg viewBox="0 0 200 70" className="h-[70px] w-full">
      {v === 'spark' && (
        <>
          <motion.path
            {...draw}
            d="M0 55 L25 48 L50 52 L75 36 L100 40 L125 26 L150 30 L175 16 L200 20"
            fill="none"
            stroke={c}
            strokeWidth="2.5"
          />
          <motion.path
            {...draw}
            d="M150 30 L175 22 L200 26"
            fill="none"
            stroke={c}
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity=".6"
          />
        </>
      )}
      {v === 'dots' &&
        Array.from({ length: 18 }, (_, i) => (
          <motion.circle
            key={i}
            cx={8 + i * 11}
            cy={20 + ((i * 37) % 36)}
            r={2 + (i % 4)}
            fill={i > 11 ? c : 'var(--emerald)'}
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
          />
        ))}
      {v === 'gap' &&
        Array.from({ length: 24 }, (_, i) => (
          <motion.rect
            key={i}
            x={i * 8.3}
            width="6"
            rx="1"
            fill={i >= 10 && i < 15 ? 'transparent' : c}
            initial={{ height: 0, y: 70 }}
            whileInView={{ height: 20 + ((i * 13) % 35), y: 70 - (20 + ((i * 13) % 35)) }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.03 }}
          />
        ))}
      {v === 'scale' && (
        <>
          <motion.line
            x1="40"
            y1="25"
            x2="160"
            y2="25"
            stroke={c}
            strokeWidth="3"
            initial={{ rotate: -10 }}
            whileInView={{ rotate: 6 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 60 }}
            style={{ originX: '100px', originY: '25px' }}
          />
          <line x1="100" y1="25" x2="100" y2="65" stroke={c} strokeWidth="3" />
          <circle cx="40" cy="40" r="10" fill="none" stroke={c} strokeWidth="2" />
          <circle cx="160" cy="40" r="10" fill={c} opacity=".7" />
        </>
      )}
      {v === 'photo' && (
        <>
          <rect x="55" y="6" width="90" height="58" rx="6" fill="none" stroke={c} strokeWidth="2" />
          {[18, 28, 38, 48].map((y, i) => (
            <motion.line
              key={y}
              x1="65"
              x2="135"
              y1={y}
              y2={y}
              stroke={c}
              strokeWidth="2"
              opacity=".55"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.15 }}
            />
          ))}
          <motion.rect
            x="55"
            width="90"
            height="3"
            fill={c}
            initial={{ y: 6 }}
            animate={{ y: [6, 60, 6] }}
            transition={{ duration: 2.6, repeat: Infinity }}
          />
        </>
      )}
      {v === 'lines' &&
        [12, 26, 40, 54].map((y, i) => (
          <motion.rect
            key={y}
            x="10"
            y={y}
            height="7"
            rx="3.5"
            fill={i === 1 ? 'var(--emerald)' : c}
            opacity={i === 1 ? 0.9 : 0.5}
            initial={{ width: 0 }}
            whileInView={{ width: [150, 120, 170, 90][i] }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
          />
        ))}
    </svg>
  );
}

const GIANT = 'WHAT THE DASHBOARD MISSED';

export function HorizontalGallery() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], ['2%', '-62%']);
  // Giant words glide the same way as the cards and finish crossing exactly when the cards do.
  const giant = useRef<HTMLDivElement>(null);
  const [gw, setGw] = useState({ text: 2000, view: 1440 });
  useEffect(() => {
    const m = () => giant.current && setGw({ text: giant.current.scrollWidth, view: innerWidth });
    m();
    addEventListener('resize', m);
    return () => removeEventListener('resize', m);
  }, []);
  const bx = useTransform(scrollYProgress, [0, 0.92], [gw.view * 0.06, -(gw.text - gw.view * 0.94)]);
  const bar = useTransform(scrollYProgress, [0, 1], ['4%', '100%']);
  const fill = useTransform(scrollYProgress, [0, 0.9], ['inset(0 72% 0 0)', 'inset(0 0% 0 0)']);
  const [n, setN] = useState(1);
  useMotionValueEvent(scrollYProgress, 'change', (v) =>
    setN(Math.min(CARDS.length, 1 + Math.floor(v * CARDS.length))),
  );
  const cur = CARDS[n - 1];
  return (
    <section ref={ref} className="relative -mt-[18vh] h-[260vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <motion.div
          ref={giant}
          aria-hidden
          style={{ x: bx }}
          className="pointer-events-none absolute bottom-[4%] left-0 whitespace-nowrap text-[11vw] font-extrabold leading-none tracking-tighter"
        >
          {/* ghost outline */}
          <span
            className="text-transparent"
            style={{ WebkitTextStroke: '2px color-mix(in srgb, var(--text) 45%, transparent)' }}
          >
            {GIANT}
          </span>
          {/* gradient fill that sweeps in as you scroll, with a glow */}
          <motion.span
            className="absolute inset-0 text-transparent"
            style={{
              clipPath: fill,
              backgroundImage:
                'linear-gradient(90deg, var(--cyan), var(--amber), var(--orange), var(--lime), var(--fuchsia), var(--violet))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              opacity: 0.95,
            }}
          >
            {GIANT}
          </motion.span>
        </motion.div>
        <div className="relative mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="label" style={{ color: 'var(--amber)' }}>
            What it catches
          </div>
          <h2 className="mt-1.5 max-w-2xl text-[28px] font-extrabold leading-tight tracking-tight md:text-[40px]">
            Six ways to see <span className="grad-text">what the dashboard missed.</span>
          </h2>
        </div>
        <motion.div
          style={{ x }}
          className="relative mt-8 flex gap-4 pl-[max(1rem,calc((100vw-72rem)/2+1.5rem))]"
        >
          {CARDS.map((c, i) => (
            <GalleryCard key={c.t} c={c} i={i} progress={scrollYProgress} />
          ))}
        </motion.div>
        <div className="relative z-10 mx-auto mt-8 flex w-full max-w-6xl items-center gap-4 px-4 md:px-6">
          <span className="mono text-[13px]">
            <motion.span
              key={n}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="inline-block font-semibold"
              style={{ color: cur.c }}
            >
              {String(n).padStart(2, '0')}
            </motion.span>
            <span className="text-[var(--faint)]"> / {String(CARDS.length).padStart(2, '0')}</span>
          </span>
          <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--line)]">
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: bar,
                background:
                  'linear-gradient(90deg, var(--cyan), var(--amber), var(--orange), var(--lime), var(--fuchsia), var(--violet))',
              }}
            />
          </span>
          <motion.span
            key={cur.t}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex min-w-[150px] items-center justify-end gap-1.5 text-[12px] font-bold"
          >
            <cur.ic size={13} style={{ color: cur.c }} /> {cur.t}
          </motion.span>
        </div>
      </div>
    </section>
  );
}

function GalleryCard({
  c,
  i,
  progress,
}: {
  c: (typeof CARDS)[number];
  i: number;
  progress: MotionValue<number>;
}) {
  const rot = useTransform(progress, [0, 1], [i % 2 ? 2 : -2, i % 2 ? -2 : 2]);
  return (
    <motion.div
      style={{
        rotate: rot,
        backdropFilter: 'blur(18px)',
        background: 'color-mix(in srgb, var(--panel) 72%, transparent)',
      }}
      whileHover={{ y: -8, scale: 1.02 }}
      className="panel w-[78vw] max-w-[340px] flex-none p-4 md:w-[340px]"
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${c.c} 18%, transparent)`, color: c.c }}
      >
        <c.ic size={17} />
      </span>
      <div className="mt-3 text-[17px] font-extrabold">{c.t}</div>
      <div className="mt-1 min-h-[38px] text-[12.5px] text-[var(--muted)]">{c.d}</div>
      <div className="mt-3">
        <CardVisual v={c.v} c={c.c} />
      </div>
    </motion.div>
  );
}

/** A thin band between sections: real, checked results drifting past, tied to the next section by a glowing line. */
export function ProofTicker() {
  const items = [
    { t: '£93,531.25 recalculated by separate code, to the penny', c: 'var(--emerald)' },
    { t: '12 of 12 figures confirmed in a live AI briefing', c: 'var(--fuchsia)' },
    { t: 'Flagged customers stayed away 32% vs 8% (p = 0.004)', c: 'var(--amber)' },
    { t: '1 false alarm in 1,530 simulated product histories', c: 'var(--cyan)' },
    { t: '261,658 real rows from a UK gift shop', c: 'var(--violet)' },
    { t: '256 automated tests + 5 browser tests', c: 'var(--sky)' },
  ];
  return (
    <section className="relative py-8">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 md:px-6">
        <motion.span
          className="h-px flex-1"
          style={{ background: 'linear-gradient(90deg, transparent, var(--violet))', originX: 1 }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
        />
        <span className="label flex items-center gap-1.5" style={{ color: 'var(--emerald)' }}>
          <BadgeCheck size={12} /> Checked, not claimed
        </span>
        <motion.span
          className="h-px flex-1"
          style={{ background: 'linear-gradient(90deg, var(--violet), transparent)', originX: 0 }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
        />
      </div>
      <div className="mt-3">
        <Marquee items={items} />
      </div>
      <div className="mt-4 flex justify-center">
        <span className="relative h-12 w-px overflow-hidden bg-[var(--line)]">
          <motion.span
            className="absolute inset-x-0 h-4"
            style={{ background: 'linear-gradient(transparent, var(--amber), transparent)' }}
            animate={{ y: [-16, 48] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        </span>
      </div>
    </section>
  );
}
