import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, RotateCcw } from 'lucide-react';
import { post } from '../api';
import { useStore } from '../store';

/** Site pages describe the real UK shop. After an upload they show the visitor's own file, so say so
 * and offer a one-click way back to the sample shop. */
export function SampleNotice({ className = '' }: { className?: string }) {
  const { dataset, refresh } = useStore();
  const [busy, setBusy] = useState(false);
  if (!dataset || dataset.source === 'case-study') return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`tint mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] ${className}`}
      style={{ '--c': 'var(--cyan)' } as React.CSSProperties}
    >
      <FileText size={13} style={{ color: 'var(--cyan)' }} />
      <span className="text-[var(--muted)]">
        Showing your file, <span className="font-bold text-[var(--text)]">{dataset.name}</span>
      </span>
      <motion.button
        whileTap={{ scale: 0.95 }}
        disabled={busy}
        className="btn !h-7 text-[11.5px]"
        onClick={async () => {
          setBusy(true);
          try {
            await post('/api/dataset/case-study', {});
            await refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        <RotateCcw size={12} className={busy ? 'animate-spin' : ''} />
        Back to the UK shop
      </motion.button>
    </motion.div>
  );
}
