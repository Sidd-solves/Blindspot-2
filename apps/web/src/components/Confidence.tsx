import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

/**
 * Evidence indicator: what kind of evidence stands behind a number. The kinds are different, not points on one
 * certainty scale, so the hover card always names the kind first; the bars are a quick visual cue only.
 *   measured (counted from the rows) ··· 3 bars
 *   tested, p or q < 0.01 ·············· 3 bars   · tested, < 0.05 ··· 2 bars   · not significant ··· 1 bar
 *   forecast with a replayed track record · 2 bars
 *   unusual under a model ·············· 2 bars
 *   rule of thumb / planning estimate ·· 1 bar
 */
export type Sure =
  | { kind: 'measured' }
  | { kind: 'tested'; p: number | null; pKind?: 'p' | 'q' }
  | { kind: 'rule' }
  | { kind: 'estimate'; note?: string }
  | { kind: 'forecast'; note?: string }
  | { kind: 'model'; note?: string };

const LOOK = {
  measured: {
    c: 'var(--emerald)',
    label: 'Measured',
    hint: 'Counted directly from your rows. No statistics needed.',
  },
  tested: {
    c: 'var(--violet)',
    label: 'Statistically tested',
    hint: 'Passed a significance test on your data.',
  },
  forecast: {
    c: 'var(--cyan)',
    label: 'Forecast with a track record',
    hint: 'Replayed on past months before being shown; with few months, its range is only roughly calibrated.',
  },
  model: {
    c: 'var(--sky)',
    label: 'Unusual under a model',
    hint: 'Unlikely if the usual pattern had held. It shows that something changed, not why.',
  },
  rule: {
    c: 'var(--amber)',
    label: 'Rule of thumb',
    hint: 'A common threshold check, not a statistical test.',
  },
  estimate: {
    c: 'var(--amber)',
    label: 'Planning estimate',
    hint: 'Based on a stated assumption, not measured.',
  },
} as const;

export function sureOf(f: { basis?: string | null; pValue?: number | null; pKind?: 'p' | 'q' }): Sure {
  return f.basis === 'measured'
    ? { kind: 'measured' }
    : f.basis === 'tested'
      ? { kind: 'tested', p: f.pValue ?? null, pKind: f.pKind }
      : { kind: 'rule' };
}

export function Confidence({ sure, className = '' }: { sure: Sure; className?: string }) {
  const [open, setOpen] = useState(false);
  const weak = sure.kind === 'tested' && (sure.p === null || sure.p >= 0.05);
  const look = weak
    ? {
        c: 'var(--sky)',
        label: 'Tested, not significant',
        hint: 'Checked with a test, but it could still be chance. Treat it as a signal to watch.',
      }
    : LOOK[sure.kind];
  const bars =
    sure.kind === 'measured'
      ? 3
      : sure.kind === 'tested'
        ? sure.p !== null && sure.p < 0.01
          ? 3
          : sure.p !== null && sure.p < 0.05
            ? 2
            : 1
        : sure.kind === 'forecast' || sure.kind === 'model'
          ? 2
          : 1;
  const detail =
    sure.kind === 'tested' && sure.p !== null
      ? `${sure.pKind === 'q' ? 'BH-adjusted q' : 'p'} ${sure.p < 0.001 ? '< 0.001' : `= ${sure.p.toFixed(3)}`}`
      : 'note' in sure && sure.note
        ? sure.note
        : null;
  return (
    <span
      className={`relative inline-flex flex-none items-end gap-[2px] align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      role="img"
      aria-label={`Evidence: ${look.label}${detail ? `, ${detail}` : ''}`}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block w-[3px] rounded-full"
          style={{ height: 5 + i * 3, background: i < bars ? look.c : 'var(--line-strong)' }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 500, damping: 20 }}
        />
      ))}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="panel pointer-events-none absolute bottom-full right-0 z-50 mb-1.5 w-[210px] px-2.5 py-2 text-left"
            style={{ background: 'var(--panel-solid)' }}
          >
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--faint)]">
              Evidence type
            </span>
            <span className="block text-[11.5px] font-extrabold" style={{ color: look.c }}>
              {look.label}
            </span>
            {detail && <span className="mono block text-[11px] text-[var(--text)]">{detail}</span>}
            <span className="block text-[11px] leading-snug text-[var(--muted)]">{look.hint}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
