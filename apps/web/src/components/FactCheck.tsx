import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { BadgeCheck, Sigma, TriangleAlert, Wand2 } from 'lucide-react';

export type ClaimStatus = 'verified' | 'derived' | 'unverified';
export interface Claim {
  text: string;
  status: ClaimStatus;
  source: string | null;
}
export interface FactCheckResult {
  claims: Claim[];
  checked: number;
  verified: number;
  derived: number;
  unverified: number;
}
export interface Correction {
  before: number;
  after: number;
  flagged: string[];
}

const LOOK: Record<ClaimStatus, { c: string; label: string }> = {
  verified: { c: 'var(--emerald)', label: 'Matches' },
  derived: { c: 'var(--cyan)', label: 'Calculated from' },
  unverified: { c: 'var(--amber)', label: 'Not found in any tool result' },
};

const toolName = (t: string | null) => (t ? t.replace(/-/g, ' ') : 'the analysis');

/** Wraps each checked figure in an answer with an underline that says whether the engine confirms it. */
export function highlighter(fc: FactCheckResult | null | undefined) {
  if (!fc?.claims.length) return undefined;
  const byText = new Map<string, Claim>();
  for (const c of fc.claims) if (!byText.has(c.text)) byText.set(c.text, c);
  const esc = [...byText.keys()]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${esc.join('|')})`, 'g');
  return (s: string): ReactNode[] =>
    s.split(re).map((part, i) => {
      const c = byText.get(part);
      if (!c) return part;
      const l = LOOK[c.status];
      const tip = c.status === 'unverified' ? l.label : `${l.label} ${toolName(c.source)}`;
      return (
        <span
          key={i}
          title={tip}
          aria-label={`${part} (${tip})`}
          className="fact rounded-[3px] px-[1px] font-semibold"
          style={{
            textDecoration: `underline ${c.status === 'unverified' ? 'wavy' : 'solid'} ${l.c}`,
            textUnderlineOffset: 3,
            textDecorationThickness: 1.5,
            background: `color-mix(in srgb, ${l.c} 10%, transparent)`,
          }}
        >
          {part}
        </span>
      );
    });
}

/** The verdict under an AI answer: how many of its figures the engine confirms. */
export function FactCheckBar({ fc, corrected }: { fc: FactCheckResult; corrected?: Correction | null }) {
  if (!fc.checked)
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--faint)]">
        <BadgeCheck size={12} /> No figures to check in this answer.
      </div>
    );
  const ok = fc.verified + fc.derived;
  const share = ok / fc.checked;
  const c = fc.unverified ? 'var(--amber)' : 'var(--emerald)';
  return (
    <div className="mt-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
        <span className="flex items-center gap-1 font-bold" style={{ color: c }}>
          {fc.unverified ? <TriangleAlert size={12} /> : <BadgeCheck size={12} />}
          Fact-check
        </span>
        <span className="text-[var(--muted)]">
          <b className="text-[var(--text)]">
            {ok} of {fc.checked}
          </b>{' '}
          figures match the analysis engine
        </span>
        <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-[var(--line)]">
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: `linear-gradient(90deg, var(--emerald), ${c})`, boxShadow: `0 0 8px ${c}` }}
            initial={{ width: 0 }}
            animate={{ width: `${share * 100}%` }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        </span>
        <span className="flex items-center gap-2 text-[10.5px] text-[var(--faint)]">
          <span className="flex items-center gap-0.5">
            <BadgeCheck size={10} style={{ color: 'var(--emerald)' }} /> {fc.verified} exact
          </span>
          {fc.derived > 0 && (
            <span className="flex items-center gap-0.5">
              <Sigma size={10} style={{ color: 'var(--cyan)' }} /> {fc.derived} calculated
            </span>
          )}
          {fc.unverified > 0 && (
            <span className="flex items-center gap-0.5">
              <TriangleAlert size={10} style={{ color: 'var(--amber)' }} /> {fc.unverified} unconfirmed
            </span>
          )}
        </span>
      </div>
      {corrected && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-1 flex items-start gap-1 text-[11px] text-[var(--muted)]"
        >
          <Wand2 size={11} className="mt-0.5 flex-none" style={{ color: 'var(--fuchsia)' }} />
          <span>
            Self-corrected: the first draft had {corrected.before} figure{corrected.before === 1 ? '' : 's'}{' '}
            no tool returned ({corrected.flagged.slice(0, 4).join(', ')}). It was sent back to check them
            {corrected.after === 0
              ? ', and every figure now matches.'
              : `; ${corrected.after} still unconfirmed.`}
          </span>
        </motion.div>
      )}
    </div>
  );
}
