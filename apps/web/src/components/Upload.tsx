import { motion } from 'framer-motion';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Check, UploadCloud } from 'lucide-react';
import { useStore } from '../store';
import { Loading } from './ui';

export const ACCEPT = '.csv,.tsv,.txt,.tab,.xlsx,.xlsm,.xls,.ods,.numbers,.pdf,text/csv,application/pdf';

/** Drop zone for any sales file. "add" mode merges the file into what's already loaded (to fill in missing details). */
export function UploadZone({ c = 'var(--blue)', title, hint, icon, compact, onDone, mode = 'replace' }: { c?: string; title: string; hint: string; icon?: ReactNode; compact?: boolean; onDone?: () => void; mode?: 'replace' | 'add' }) {
  const { upload, uploadFiles } = useStore();
  const [drag, setDrag] = useState(false), [mine, setMine] = useState(false), [err, setErr] = useState('');
  const go = async (list?: FileList | null) => {
    const files = [...(list ?? [])].slice(0, 5);
    if (!files.length) return;
    setErr('');
    if (files.some((f) => f.size > 25e6)) return setErr('Files up to 25 MB. Export a shorter date range, or split it into two files and add both.');
    setMine(true);
    const r = await uploadFiles(files, mode);
    if (r !== 'failed') onDone?.(); // fixable problems open the review screen, where columns can be picked
  };
  const busy = mine && !!upload.busy;
  return (
    <div>
      <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); go(e.dataTransfer.files); }}
        className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-3 text-center transition-colors ${compact ? 'py-3' : 'py-5'} ${busy ? 'scan' : ''}`}
        style={{ borderColor: drag ? c : 'var(--line-strong)', background: drag ? `color-mix(in srgb, ${c} 8%, transparent)` : 'transparent' } as CSSProperties}>
        <input type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { go(e.target.files); e.target.value = ''; }} />
        <motion.div animate={{ y: drag ? -5 : [0, -3, 0] }} transition={{ duration: 2, repeat: drag ? 0 : Infinity }} style={{ color: c }}>{icon ?? <UploadCloud size={22} />}</motion.div>
        <div className="mt-1 text-[12.5px] font-bold">{title}</div>
        <div className="text-[10.5px] text-[var(--faint)]">{hint}</div>
      </label>
      <div className="mt-1.5 min-h-[18px] text-[11.5px]">
        {err ? <span className="text-[var(--rose)]">{err}</span> : busy ? <Loading steps={[upload.busy!, 'Finding the columns…', 'Checking every row…']} />
          : mine && upload.error ? <span className="text-[var(--rose)]">{upload.error}</span>
          : mine && upload.report ? <span className="flex items-center gap-1 text-[var(--emerald)]"><Check size={12} />Read {upload.report.rowsUsed.toLocaleString()} rows</span> : null}
      </div>
    </div>
  );
}
