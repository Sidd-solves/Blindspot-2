import { AnimatePresence, motion } from 'framer-motion';
import { useState, type CSSProperties } from 'react';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { post } from '../api';
import { useStore } from '../store';
import { Markdown } from './ui';
import { highlighter, type FactCheckResult } from './FactCheck';

interface Draft {
  subject: string;
  body: string;
  why: string;
  factCheck: FactCheckResult;
}

/** The plain draft, plus a "Write with AI" version personalised from what this customer bought. Nothing is sent. */
export function AiWinback({
  customer,
  shopName,
  template,
}: {
  customer: string;
  shopName: string;
  template: string;
}) {
  const { health } = useStore();
  const [d, setD] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState<string | null>(null),
    [copied, setCopied] = useState(false);
  const text = d ? `Subject: ${d.subject}\n\n${d.body}` : template;
  const write = async () => {
    setBusy(true);
    setErr(null);
    try {
      setD(await post<Draft>('/api/ai/winback', { customer, shopName }));
    } catch (e: any) {
      setErr(e?.message ?? 'Writing failed.');
    }
    setBusy(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; the text is still visible */
    }
  };
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={d ? 'ai' : 'plain'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          {d && (
            <div
              className="mb-1 flex items-center gap-1 text-[11px] font-bold"
              style={{ color: 'var(--fuchsia)' }}
            >
              <Sparkles size={11} /> Written by AI · {d.subject}
            </div>
          )}
          <pre className="whitespace-pre-wrap font-sans text-[12px] leading-snug">
            {d ? d.body : template}
          </pre>
          {d && (
            <div className="mt-1.5 text-[11.5px] text-[var(--muted)]">
              <b>Why this customer:</b> <Markdown text={d.why} mark={highlighter(d.factCheck)} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {err && (
        <div role="alert" className="mt-1 text-[11.5px]" style={{ color: 'var(--rose)' }}>
          {err}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <motion.button whileTap={{ scale: 0.95 }} className="btn !h-7 text-[11.5px]" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy message'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          className="btn !h-7 text-[11.5px]"
          style={{ '--c': 'var(--fuchsia)' } as CSSProperties}
          onClick={write}
          disabled={!health?.ai || busy}
          title={health?.ai ? undefined : 'Needs a Claude API key on the server'}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {busy ? 'Writing…' : d ? 'Write another' : 'Write with AI'}
        </motion.button>
      </div>
    </>
  );
}
