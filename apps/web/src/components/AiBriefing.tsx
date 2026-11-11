import { AnimatePresence, motion } from 'framer-motion';
import { useState, type CSSProperties } from 'react';
import { ArrowRight, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { post } from '../api';
import { useStore } from '../store';
import { go } from '../App';
import { Markdown } from './ui';
import { FactCheckBar, highlighter, type FactCheckResult } from './FactCheck';

interface Briefing {
  headline: string;
  points: { text: string; findingIds: string[]; check: FactCheckResult }[];
  firstAction: { text: string; findingId: string };
  factCheck: FactCheckResult;
  model: string;
}

const STEPS = [
  'Reading every finding…',
  'Checking the forecast…',
  'Writing the briefing…',
  'Fact-checking each figure…',
];

/** A 30-second written briefing from Claude, built only from the engine's findings, with every figure checked. */
export function AiBriefing() {
  const { health, findings, version } = useStore();
  const [b, setB] = useState<{ v: number; data: Briefing } | null>(null);
  const [busy, setBusy] = useState(false),
    [step, setStep] = useState(0),
    [err, setErr] = useState<string | null>(null);
  const ai = !!health?.ai;
  const data = b && b.v === version ? b.data : null;
  const titleOf = (id: string) => findings.find((f) => f.id === id)?.title ?? id;

  const run = async () => {
    setBusy(true);
    setErr(null);
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 1800);
    try {
      setB({ v: version, data: await post<Briefing>('/api/ai/briefing', {}) });
    } catch (e: any) {
      setErr(e?.message ?? 'The AI briefing failed.');
    }
    clearInterval(t);
    setBusy(false);
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      className="panel relative overflow-hidden p-3 md:col-span-6 xl:col-span-12"
      style={{ borderColor: 'color-mix(in srgb, var(--fuchsia) 35%, var(--line))' }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--fuchsia) 35%, transparent), transparent 70%)',
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative flex flex-wrap items-center gap-2">
        <span
          className="grid h-7 w-7 place-items-center rounded-lg"
          style={{ background: 'linear-gradient(135deg, var(--fuchsia), var(--violet))' }}
        >
          <Sparkles size={14} color="white" />
        </span>
        <span className="text-[13px] font-extrabold">AI briefing</span>
        <span className="text-[11.5px] text-[var(--muted)]">
          {data
            ? `Written by ${data.model} from ${findings.length} findings`
            : 'Every figure checked against the engine'}
        </span>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={run}
          disabled={!ai || busy}
          title={ai ? undefined : 'Needs a Claude API key on the server'}
          className="btn ml-auto !h-8 text-[12px]"
          style={{ '--c': 'var(--fuchsia)' } as CSSProperties}
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : data ? (
            <RotateCcw size={13} />
          ) : (
            <Sparkles size={13} />
          )}
          {busy ? 'Writing…' : data ? 'Rewrite' : ai ? 'Write my briefing' : 'AI not connected'}
        </motion.button>
      </div>
      <AnimatePresence mode="wait">
        {busy && (
          <motion.div
            key="busy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative mt-2.5 space-y-1.5"
          >
            {STEPS.map((s, i) => (
              <motion.div
                key={s}
                animate={{ opacity: i <= step ? 1 : 0.35, x: i === step ? 2 : 0 }}
                className="flex items-center gap-1.5 text-[12px]"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: i < step ? 'var(--emerald)' : i === step ? 'var(--fuchsia)' : 'var(--line)',
                  }}
                />
                {s}
              </motion.div>
            ))}
          </motion.div>
        )}
        {!busy && err && (
          <motion.div
            key="err"
            role="alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2 text-[12px]"
          >
            <b style={{ color: 'var(--rose)' }}>That didn’t work.</b>{' '}
            <span className="text-[var(--muted)]">{err}</span>
          </motion.div>
        )}
        {!busy && data && (
          <motion.div
            key="data"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mt-2.5"
          >
            <div className="text-[15px] font-extrabold leading-snug">
              <Markdown text={data.headline} mark={highlighter(data.factCheck)} />
            </div>
            <div className="mt-1.5 grid gap-1.5 md:grid-cols-2">
              {data.points.map((p, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i }}
                  className="rounded-lg border px-2.5 py-1.5 text-[12.5px] leading-snug"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <Markdown text={p.text} mark={highlighter(p.check)} />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.findingIds.map((id) => (
                      <button
                        key={id}
                        onClick={() => go('risk', `?f=${encodeURIComponent(id)}`)}
                        className="chip cursor-pointer !text-[10.5px]"
                        style={{ '--c': 'var(--violet)' } as CSSProperties}
                        title="Open the finding this comes from"
                      >
                        {titleOf(id).slice(0, 42)}
                        {titleOf(id).length > 42 ? '…' : ''}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
            <button
              onClick={() => go('risk', `?f=${encodeURIComponent(data.firstAction.findingId)}`)}
              className="tint mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px]"
              style={{ '--c': 'var(--emerald)' } as CSSProperties}
            >
              <b style={{ color: 'var(--emerald)' }}>Do first:</b> {data.firstAction.text}
              <ArrowRight size={12} className="ml-auto flex-none" />
            </button>
            <FactCheckBar fc={data.factCheck} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
