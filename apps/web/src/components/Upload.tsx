import { motion } from 'framer-motion';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Check, UploadCloud } from 'lucide-react';
import { post } from '../api';
import { useStore } from '../store';
import { Loading } from './ui';

/** Turns a CSV or Excel file into CSV text in the browser. Excel parsing loads on demand. */
async function fileToCsv(f: File): Promise<string> {
  if (/\.(xlsx|xls)$/i.test(f.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
    return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { dateNF: 'yyyy-mm-dd' });
  }
  return f.text();
}

export function UploadZone({ c = 'var(--blue)', title, hint, icon, compact }: { c?: string; title: string; hint: string; icon?: ReactNode; compact?: boolean }) {
  const { refresh } = useStore();
  const [drag, setDrag] = useState(false), [st, setSt] = useState<{ busy?: boolean; msg?: string; err?: string }>({});
  const upload = async (f?: File) => {
    if (!f) return;
    if (!/\.(csv|xlsx|xls)$/i.test(f.name) || f.size > 15e6) return setSt({ err: 'CSV or Excel files under 15MB.' });
    setSt({ busy: true });
    try {
      const r = await post<any>(`/api/dataset/csv?name=${encodeURIComponent(f.name.replace(/[^\w .()-]/g, ''))}`, await fileToCsv(f), 'text/csv');
      setSt({ msg: `Loaded ${r.rows.toLocaleString()} rows from ${r.name}` });
      await refresh();
    } catch (e: any) { setSt({ err: e.message }); }
  };
  return (
    <div>
      <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }}
        className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-3 text-center transition-colors ${compact ? 'py-3' : 'py-5'} ${st.busy ? 'scan' : ''}`}
        style={{ borderColor: drag ? c : 'var(--line-strong)', background: drag ? `color-mix(in srgb, ${c} 8%, transparent)` : 'transparent' } as CSSProperties}>
        <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <motion.div animate={{ y: drag ? -5 : [0, -3, 0] }} transition={{ duration: 2, repeat: drag ? 0 : Infinity }} style={{ color: c }}>{icon ?? <UploadCloud size={22} />}</motion.div>
        <div className="mt-1 text-[12.5px] font-bold">{title}</div>
        <div className="text-[10.5px] text-[var(--faint)]">{hint}</div>
      </label>
      <div className="mt-1.5 min-h-[18px] text-[11.5px]">
        {st.busy ? <Loading steps={['Reading file…', 'Detecting columns…', 'Re-running analysis…']} /> : st.err ? <span className="text-[var(--rose)]">{st.err}</span> : st.msg ? <span className="flex items-center gap-1 text-[var(--emerald)]"><Check size={12} />{st.msg}</span> : null}
      </div>
    </div>
  );
}
