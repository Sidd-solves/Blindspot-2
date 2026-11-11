import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, BarChart3, BookOpen, CreditCard, Download, Eye, FileSpreadsheet, FileText, Lock, Package, PlugZap, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Square as SquareIcon, Store, Table2, Upload, Zap } from 'lucide-react';
import { post } from '../api';
import { useStore } from '../store';
import { UploadZone } from '../components/Upload';
import { CountUp, Loading } from '../components/ui';
import { BeamCard } from './Effects';
import { openApp } from './SiteLayout';

export const guideGo = (id: string) => { location.hash = `/guide/${id}`; window.scrollTo({ top: 0 }); };

/** Loads the real sample shop for this visitor, then opens the app on the given page. */
export function useOpenSample() {
  const { dataset, refresh } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const open = async (page: string) => {
    setBusy(page);
    try { if (dataset?.source !== 'case-study') { await post('/api/dataset/case-study', {}); await refresh(); } openApp(page); }
    finally { setBusy(null); }
  };
  return { open, busy };
}

const PLATFORMS = [
  { id: 'shopify-export', t: 'Shopify', icon: ShoppingBag, c: 'var(--emerald)' },
  { id: 'woocommerce', t: 'WooCommerce', icon: ShoppingCart, c: 'var(--fuchsia)' },
  { id: 'etsy', t: 'Etsy', icon: Store, c: 'var(--orange)' },
  { id: 'square', t: 'Square', icon: SquareIcon, c: 'var(--sky)' },
  { id: 'amazon', t: 'Amazon', icon: Package, c: 'var(--amber)' },
  { id: 'stripe', t: 'Stripe', icon: CreditCard, c: 'var(--violet)' },
  { id: 'tableau', t: 'Tableau', icon: BarChart3, c: 'var(--cyan)' },
  { id: 'spreadsheet', t: 'Excel / Sheets', icon: FileSpreadsheet, c: 'var(--blue)' },
];

// The sample store's actual top findings (kept in step with what the app shows for it).
const PREVIEW_FINDINGS = [
  { t: '10 best customers stopped ordering (£93.5K a year)', c: 'var(--amber)' },
  { t: 'New customers reorder less: 51% → 42% (tested)', c: 'var(--fuchsia)' },
  { t: '23 products went from selling to zero (£36.3K)', c: 'var(--lime)' },
  { t: '509 reversed order lines cleaned out first', c: 'var(--cyan)' },
];
const SPARK = [18, 22, 19, 26, 24, 31, 28, 36, 33, 41, 38, 47, 52, 44, 58];

/** A small live-looking dashboard: the line draws itself, numbers count up, findings rotate. */
function SamplePreview() {
  const [k, setK] = useState(0);
  useEffect(() => { const t = setInterval(() => setK((x) => (x + 1) % PREVIEW_FINDINGS.length), 2200); return () => clearInterval(t); }, []);
  const max = Math.max(...SPARK), pts = SPARK.map((v, i) => `${(i / (SPARK.length - 1)) * 100},${40 - (v / max) * 34}`).join(' ');
  const f = PREVIEW_FINDINGS[k];
  return (
    <div className="relative overflow-hidden rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'linear-gradient(160deg, color-mix(in srgb, var(--violet) 10%, transparent), transparent 60%)' }}>
      <div className="mb-2 flex items-center gap-1.5">{['var(--rose)', 'var(--amber)', 'var(--emerald)'].map((c) => <span key={c} className="h-2 w-2 rounded-full" style={{ background: c, opacity: 0.7 }} />)}<span className="ml-1 text-[11px] font-bold text-[var(--faint)]">UK gift shop · Overview</span></div>
      <div className="grid grid-cols-3 gap-1.5">
        {[{ l: 'Records', v: 261658, c: 'var(--violet)' }, { l: 'Orders', v: 9964, c: 'var(--cyan)' }, { l: 'Customers', v: 1458, c: 'var(--emerald)' }].map((s) => (
          <div key={s.l} className="rounded-lg px-2 py-1.5" style={{ background: 'var(--line)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--faint)]">{s.l}</div>
            <CountUp value={s.v} className="mono block text-[13px] font-semibold" />
            <div className="mt-1 h-[2px] rounded" style={{ background: s.c, boxShadow: `0 0 8px ${s.c}` }} />
          </div>
        ))}
      </div>
      <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="mt-2 h-16 w-full">
        <defs><linearGradient id="sp-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style={{ stopColor: 'var(--violet)', stopOpacity: 0.45 }} /><stop offset="1" style={{ stopColor: 'var(--violet)', stopOpacity: 0 }} /></linearGradient></defs>
        <motion.polygon points={`0,42 ${pts} 100,42`} fill="url(#sp-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.8 }} />
        <motion.polyline points={pts} fill="none" stroke="var(--violet)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 3px var(--violet))' }} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
      </svg>
      <div className="mt-1 h-[30px] overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={k} initial={{ y: 22, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -22, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${f.c} 12%, transparent)`, borderLeft: `3px solid ${f.c}` }}>
            <Sparkles size={11} style={{ color: f.c }} />{f.t}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="scanline pointer-events-none absolute inset-0" />
    </div>
  );
}

export default function Start() {
  const { open, busy } = useOpenSample();
  const { stageFiles } = useStore();
  const toApp = () => openApp('overview');
  // One click: put the sample PDF in the upload list, exactly as if it had been dropped there.
  const [pdfBusy, setPdfBusy] = useState(false);
  const tryPdf = async () => {
    setPdfBusy(true);
    try {
      const blob = await (await fetch('/samples/harbor_coffee_order_report.pdf')).blob();
      stageFiles([new File([blob], 'harbor_coffee_order_report.pdf', { type: 'application/pdf' })]);
      document.getElementById('upload-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally { setPdfBusy(false); }
  };
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 md:px-6">
      <div className="text-center">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="label" style={{ color: 'var(--emerald)' }}>Get started</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="text-glow mt-2 text-[30px] font-extrabold leading-tight tracking-tight md:text-[42px]">How do you want to <span className="grad-text">start?</span></motion.h1>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-3 flex flex-wrap justify-center gap-1.5">
          {[{ i: Lock, t: 'Read-only', c: 'var(--emerald)' }, { i: ShieldCheck, t: 'Private to you', c: 'var(--cyan)' }, { i: Zap, t: 'Results in seconds', c: 'var(--amber)' }].map((x) => <span key={x.t} className="chip !py-1" style={{ '--c': x.c } as CSSProperties}><x.i size={11} />{x.t}</span>)}
        </motion.div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-3">
          <div className="label">Use your own data</div>
          <motion.div id="upload-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 26 }}>
            <BeamCard c="var(--emerald)" className="p-4">
              <div className="flex flex-wrap items-center gap-1.5"><Upload size={16} style={{ color: 'var(--emerald)' }} /><span className="text-[15px] font-extrabold">Upload an export</span><span className="chip !py-0.5 !text-[11px]" style={{ '--c': 'var(--emerald)' } as CSSProperties}>Any store · no setup</span></div>
              <div className="mt-3"><UploadZone c="var(--emerald)" title="Drop your export here" hint="CSV, Excel or PDF · from Shopify, Tableau, Etsy, WooCommerce, Square, Amazon and more" onDone={toApp} /></div>
              <div className="label mb-2 mt-2">How to export from</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {PLATFORMS.map((p, i) => (
                  <motion.button key={p.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.04 }} whileHover={{ y: -2, scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => guideGo(p.id)}
                    className="group flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] font-bold" style={{ borderColor: `color-mix(in srgb, ${p.c} 28%, var(--line))`, background: `color-mix(in srgb, ${p.c} 7%, transparent)` }}>
                    <span className="grid h-6 w-6 flex-none place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${p.c} 20%, transparent)`, color: p.c }}><p.icon size={13} /></span>
                    <span className="min-w-0 flex-1 truncate">{p.t}</span>
                    <ArrowRight size={11} className="flex-none opacity-0 transition-opacity group-hover:opacity-100" style={{ color: p.c }} />
                  </motion.button>
                ))}
              </div>
            </BeamCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, type: 'spring', stiffness: 220, damping: 26 }}>
            <BeamCard c="var(--cyan)" className="p-4">
              <div className="flex items-center gap-1.5"><PlugZap size={16} style={{ color: 'var(--cyan)' }} /><span className="text-[15px] font-extrabold">Or connect live</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[{ id: 'shopify-connect', t: 'Shopify', d: 'Pulls your latest orders. Read-only.', icon: ShoppingBag, c: 'var(--emerald)', tag: 'Live' }, { id: 'tableau', t: 'Tableau', d: 'Reads a live dashboard through our extension.', icon: BarChart3, c: 'var(--cyan)', tag: 'Beta' }].map((x) => (
                  <div key={x.id} className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${x.c} 26%, var(--line))` }}>
                    <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${x.c} 18%, transparent)`, color: x.c }}><x.icon size={14} /></span><span className="text-[13px] font-extrabold">{x.t}</span><span className="chip !py-0 !text-[11px]" style={{ '--c': x.c } as CSSProperties}>{x.tag}</span></div>
                    <div className="mt-1 text-[11.5px] text-[var(--muted)]">{x.d}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <motion.button whileTap={{ scale: 0.95 }} className="btn btn-primary !h-7 text-[11px]" onClick={() => openApp('data')}>Connect</motion.button>
                      <button onClick={() => guideGo(x.id)} className="flex items-center gap-1 text-[11px] font-bold" style={{ color: x.c }}><BookOpen size={11} />See how</button>
                    </div>
                  </div>
                ))}
              </div>
            </BeamCard>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[11.5px] text-[var(--muted)]" style={{ borderColor: 'var(--line)' }}>
            <FileText size={15} className="flex-none" style={{ color: 'var(--sky)' }} />
            <span><b className="text-[var(--text)]">PDF reports work too.</b> Only scanned photos and screenshots can't be read: they're pictures, not text. After every upload you'll see exactly how each column was read.</span>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 26 }} className="lg:sticky lg:top-24 lg:self-start">
          <div className="label mb-3">Or just look around</div>
          <BeamCard on c="var(--violet)" className="p-4">
            <div className="flex items-center gap-2"><Eye size={16} style={{ color: 'var(--violet)' }} /><span className="text-[15px] font-extrabold">Try our sample store</span><span className="chip !py-0.5 !text-[11px]" style={{ '--c': 'var(--violet)' } as CSSProperties}>Real data</span></div>
            <div className="mt-1 text-[12px] text-[var(--muted)]">A real UK online gift shop: two years of sales, returns and customers.</div>
            <div className="mt-3"><SamplePreview /></div>
            <div className="mt-3 grid gap-2">
              <motion.button whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.02 }} className="btn btn-primary !h-10 justify-center text-[13px]" onClick={() => open('overview')} disabled={!!busy}>
                {busy === 'overview' ? <Loading steps={['Loading the shop…', 'Running the analysis…']} /> : <><Sparkles size={14} />Open the app with the sample store</>}
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} className="btn !h-9 justify-center" onClick={() => open('source')} disabled={!!busy}>
                {busy === 'source' ? <Loading steps={['Loading rows…']} /> : <><Table2 size={13} style={{ color: 'var(--sky)' }} />See the source data</>}
              </motion.button>
            </div>
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <div className="label mb-1.5">Or test an upload</div>
              <motion.button whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.02 }} onClick={tryPdf} disabled={pdfBusy} className="btn !h-9 w-full justify-center" style={{ borderColor: 'color-mix(in srgb, var(--sky) 45%, var(--line))' }}>
                {pdfBusy ? <Loading steps={['Fetching the sample PDF…']} /> : <><FileText size={13} style={{ color: 'var(--sky)' }} />Try a 68-page PDF sales report</>}
              </motion.button>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-[var(--faint)]">
                <span>Or download a file to drop in yourself</span>
                <span className="flex flex-none gap-2.5">
                  <a href="/samples/harbor_coffee_order_report.pdf" download className="flex items-center gap-1 font-bold" style={{ color: 'var(--sky)' }}><Download size={11} />PDF</a>
                  <a href="/samples/real-shop-sales-sample.csv" download className="flex items-center gap-1 font-bold" style={{ color: 'var(--violet)' }}><Download size={11} />CSV</a>
                </span>
              </div>
            </div>
          </BeamCard>
        </motion.div>
      </div>
    </section>
  );
}
