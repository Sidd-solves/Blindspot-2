import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BadgeCheck, Database, Filter, RotateCcw, Sigma, TriangleAlert } from 'lucide-react';
import { usdExact } from '../api';

/**
 * Replays the check behind a finding, step by step: all records → the rows the finding used → their amounts added in
 * integer pennies → compared with the finding's own figure. It animates the real reconciliation the server just did;
 * nothing here is computed for show.
 */
export function ProofReplay({
  allRecords,
  rowsUsed,
  label,
  actualCents,
  expectCents,
  what,
  amounts,
}: {
  allRecords: number;
  rowsUsed: number;
  label: string;
  actualCents: number;
  expectCents: number | null;
  what: string;
  /** A few of the matched rows' amounts, streamed past while the total adds up. */
  amounts: number[];
}) {
  const calm = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const [run, setRun] = useState(0);
  const countRef = useRef<HTMLSpanElement>(null),
    moneyRef = useRef<HTMLSpanElement>(null);
  const ok = expectCents == null || actualCents === expectCents;

  useEffect(() => {
    setPhase(0);
    const fast = calm ? 0.15 : 1;
    const ctl: { stop: () => void }[] = [];
    const t: number[] = [];
    if (countRef.current) countRef.current.textContent = allRecords.toLocaleString();
    if (moneyRef.current) moneyRef.current.textContent = usdExact(0);
    t.push(
      window.setTimeout(() => {
        setPhase(1);
        ctl.push(
          animate(allRecords, rowsUsed, {
            duration: 1.1 * fast,
            ease: [0.16, 1, 0.3, 1],
            onUpdate: (v) =>
              countRef.current && (countRef.current.textContent = Math.round(v).toLocaleString()),
          }),
        );
      }, 450 * fast),
    );
    t.push(
      window.setTimeout(() => {
        setPhase(2);
        ctl.push(
          animate(0, actualCents, {
            duration: 1.4 * fast,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (v) =>
              moneyRef.current && (moneyRef.current.textContent = usdExact(Math.round(v) / 100)),
            onComplete: () =>
              moneyRef.current && (moneyRef.current.textContent = usdExact(actualCents / 100)),
          }),
        );
      }, 1750 * fast),
    );
    t.push(window.setTimeout(() => setPhase(3), 3350 * fast));
    return () => {
      t.forEach(clearTimeout);
      ctl.forEach((c) => c.stop());
    };
  }, [run, allRecords, rowsUsed, actualCents, calm]);

  const steps = [
    { icon: Database, t: 'All records', c: 'var(--violet)' },
    { icon: Filter, t: 'Rows the finding used', c: 'var(--sky)' },
    { icon: Sigma, t: 'Added up in pennies', c: 'var(--cyan)' },
    { icon: BadgeCheck, t: 'Compared with the finding', c: ok ? 'var(--emerald)' : 'var(--amber)' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel relative overflow-hidden p-3.5"
      style={{ '--c': 'var(--emerald)' } as CSSProperties}
    >
      <motion.div
        className="pointer-events-none absolute -left-20 top-0 h-full w-40 opacity-30 blur-2xl"
        style={{ background: 'linear-gradient(90deg, transparent, var(--cyan), transparent)' }}
        animate={{ x: ['0%', '900%'] }}
        transition={{ duration: 3.4, ease: 'easeInOut', repeat: phase < 3 ? Infinity : 0 }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div className="label">Proof replay · {label}</div>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => setRun((r) => r + 1)}
          className="btn !h-7 text-[11.5px]"
          aria-label="Replay the proof"
        >
          <RotateCcw size={12} />
          Replay
        </motion.button>
      </div>

      {/* Steps */}
      <div className="relative mt-3 grid grid-cols-4 gap-1.5">
        {steps.map((s, i) => {
          const on = phase >= i;
          return (
            <div key={s.t} className="flex min-w-0 items-center gap-1.5">
              <motion.span
                className="grid h-7 w-7 flex-none place-items-center rounded-lg"
                animate={{
                  scale: phase === i ? [1, 1.15, 1] : 1,
                  background: on ? `color-mix(in srgb, ${s.c} 22%, transparent)` : 'var(--line)',
                  color: on ? s.c : 'var(--faint)',
                  boxShadow: phase === i ? `0 0 14px ${s.c}` : '0 0 0px transparent',
                }}
                transition={{ duration: 0.5 }}
              >
                <s.icon size={14} />
              </motion.span>
              <span
                className="hidden truncate text-[11.5px] font-bold sm:block"
                style={{ color: on ? 'var(--text)' : 'var(--faint)' }}
              >
                {s.t}
              </span>
              {i < steps.length - 1 && (
                <span className="relative ml-auto hidden h-0.5 w-6 flex-none overflow-hidden rounded bg-[var(--line)] md:block">
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded"
                    style={{ background: s.c }}
                    animate={{ width: phase > i ? '100%' : '0%' }}
                    transition={{ duration: 0.4 }}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Numbers */}
      <div className="relative mt-3 grid gap-3 sm:grid-cols-[1fr_1.4fr_1.6fr]">
        <div>
          <div className="text-[11px] text-[var(--muted)]">
            {phase === 0 ? 'Records analyzed' : 'Rows kept'}
          </div>
          <span ref={countRef} className="mono text-[20px] font-semibold" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-[var(--muted)]">
            {what.charAt(0).toUpperCase() + what.slice(1)}, summed in whole pennies
          </div>
          <span ref={moneyRef} className="mono grad-text text-[20px] font-semibold" />
          <div className="relative mt-1 h-5 overflow-hidden">
            <AnimatePresence>
              {phase === 2 && (
                <motion.div
                  key={run}
                  className="absolute top-0 flex gap-1.5 whitespace-nowrap"
                  initial={{ x: '40%', opacity: 0 }}
                  animate={{ x: '-100%', opacity: [0, 1, 1, 0.6] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.5, ease: 'linear' }}
                >
                  {amounts.slice(0, 18).map((a, i) => (
                    <span
                      key={i}
                      className="mono rounded px-1 text-[10.5px]"
                      style={{
                        background: 'color-mix(in srgb, var(--cyan) 16%, transparent)',
                        color: 'var(--cyan)',
                      }}
                    >
                      +{usdExact(a)}
                    </span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex items-center">
          <AnimatePresence mode="wait">
            {phase >= 3 ? (
              <motion.div
                key="stamp"
                initial={{ scale: 1.8, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: -2 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                className="flex items-center gap-2 rounded-xl border-2 px-3 py-2"
                style={{
                  borderColor: ok ? 'var(--emerald)' : 'var(--amber)',
                  color: ok ? 'var(--emerald)' : 'var(--amber)',
                  boxShadow: `0 0 24px color-mix(in srgb, ${ok ? 'var(--emerald)' : 'var(--amber)'} 35%, transparent)`,
                }}
              >
                {ok ? <BadgeCheck size={20} /> : <TriangleAlert size={20} />}
                <div className="leading-tight">
                  <div className="text-[13px] font-extrabold">
                    {expectCents == null
                      ? 'Added up exactly'
                      : ok
                        ? 'Matches the finding to the penny'
                        : 'Differs from the finding'}
                  </div>
                  {expectCents != null && (
                    <div className="mono text-[11px] opacity-80">
                      finding said {usdExact(expectCents / 100)}
                      {!ok && ` · off by ${usdExact((actualCents - expectCents) / 100)}`}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key="wait" exit={{ opacity: 0 }} className="text-[11.5px] text-[var(--faint)]">
                Checking against the finding…
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
