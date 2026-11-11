import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import { LayoutDashboard, Database, Sparkles, ShieldAlert, SlidersHorizontal, ScanEye, FileText, Settings as Cog, Moon, Sun, RefreshCw, Filter, X } from 'lucide-react';
import { useStore } from './store';
import { Chip, Dropdown } from './components/ui';
import Overview from './pages/Overview';
import DataSources from './pages/DataSources';
import Analyst from './pages/Analyst';
import Risk from './pages/Risk';
import Simulator from './pages/Simulator';
import Audit from './pages/Audit';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, c: 'var(--violet)', el: Overview },
  { id: 'data', label: 'Data Sources', icon: Database, c: 'var(--emerald)', el: DataSources },
  { id: 'analyst', label: 'AI Analyst', icon: Sparkles, c: 'var(--fuchsia)', el: Analyst },
  { id: 'risk', label: 'Risk Intelligence', icon: ShieldAlert, c: 'var(--rose)', el: Risk },
  { id: 'simulator', label: 'Scenario Simulator', icon: SlidersHorizontal, c: 'var(--emerald)', el: Simulator },
  { id: 'audit', label: 'Dashboard Audit', icon: ScanEye, c: 'var(--amber)', el: Audit },
  { id: 'reports', label: 'Executive Reports', icon: FileText, c: 'var(--sky)', el: Reports },
  { id: 'settings', label: 'Settings', icon: Cog, c: 'var(--muted)', el: Settings },
] as const;
export type PageId = (typeof NAV)[number]['id'];
export const go = (p: PageId, query = '') => { location.hash = `/${p}${query}`; };
const current = (): PageId => (location.hash.startsWith('#/tableau') ? 'data' : NAV.find((n) => location.hash.startsWith(`#/${n.id}`))?.id ?? 'overview');

function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme !== 'light');
  const flip = () => { const t = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('ciq-theme', t); } catch { /* ignore */ } setDark(!dark); };
  return (
    <button onClick={flip} className="btn !px-2" aria-label="Toggle theme">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={dark ? 'm' : 's'} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>{dark ? <Moon size={14} /> : <Sun size={14} />}</motion.span>
      </AnimatePresence>
    </button>
  );
}

function FilterBar() {
  const { dataset, setFilter, clearFilters, loading } = useStore();
  if (!dataset) return null;
  const dims = dataset.columns.filter((c) => c.type === 'category' && c.values && c.distinct <= 50 && c.name !== 'IsReturn').slice(0, 3);
  const colors = ['var(--cyan)', 'var(--fuchsia)', 'var(--emerald)'];
  const active = Object.keys(dataset.filters).length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Filter size={13} className="text-[var(--faint)]" />
      {dims.map((d, i) => <Dropdown key={d.name} multi width={124} c={colors[i]} placeholder={d.name} value={dataset.filters[d.name] ?? []} options={d.values!} onChange={(v) => setFilter(d.name, v)} />)}
      <AnimatePresence>{active > 0 && <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} onClick={clearFilters} className="btn !h-7 !px-2 text-[11px]" disabled={loading}><X size={12} />Clear</motion.button>}</AnimatePresence>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<PageId>(current());
  const { dataset, extension, health, loading, refresh } = useStore();
  useEffect(() => { const h = () => setPage(current()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const nav = NAV.find((n) => n.id === page)!;
  const Page = nav.el;
  return (
    <div className="relative min-h-full">
      <div className="grid-bg" />
      <div className="orb" style={{ width: 420, height: 420, left: -120, top: -140, background: 'var(--violet)' }} />
      <div className="orb" style={{ width: 360, height: 360, right: -100, top: 120, background: 'var(--cyan)', animationDelay: '-7s' }} />
      <div className="orb" style={{ width: 300, height: 300, left: '40%', bottom: -160, background: 'var(--fuchsia)', animationDelay: '-13s' }} />

      <div className="relative z-10 flex min-h-full flex-col md:flex-row">
        <aside className="no-print flex-none md:sticky md:top-0 md:h-screen md:w-[208px] md:border-r" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-2 px-4 py-3.5">
            <motion.div initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260 }} className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: 'linear-gradient(135deg, var(--violet), var(--cyan))', boxShadow: '0 6px 18px -6px var(--violet)' }}>
              <svg width="16" height="16" viewBox="0 0 32 32"><path d="M7 21l6-7 5 4 7-9" stroke="white" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </motion.div>
            <div className="leading-tight"><div className="text-[14px] font-extrabold tracking-tight">Blind<span className="grad-text">spot</span></div><div className="text-[9.5px] font-bold uppercase tracking-[.14em] text-[var(--faint)]">AI analyst for small business</div></div>
          </div>
          <nav className="flex gap-0.5 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
            {NAV.map((n) => {
              const on = n.id === page;
              return (
                <button key={n.id} onClick={() => go(n.id)} className="relative flex flex-none items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[12.5px] font-bold transition-colors" style={{ color: on ? 'var(--text)' : 'var(--muted)' }}>
                  {on && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg tint" style={{ '--c': n.c } as CSSProperties} transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <motion.span whileHover={{ scale: 1.15, rotate: -6 }} className="relative grid h-[22px] w-[22px] place-items-center rounded-md" style={{ color: n.c, background: `color-mix(in srgb, ${n.c} ${on ? 22 : 12}%, transparent)` }}><n.icon size={13} /></motion.span>
                  <span className="relative whitespace-nowrap">{n.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="hidden px-3 pt-3 md:block">
            <div className="panel space-y-1.5 p-2.5 text-[11px]">
              <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Data</span><Chip c={dataset?.source === 'shopify' ? 'var(--emerald)' : dataset?.source === 'case-study' ? 'var(--violet)' : dataset?.source === 'sample' ? 'var(--amber)' : 'var(--blue)'} pulse={dataset?.source === 'shopify' || extension}>{dataset?.source === 'shopify' ? 'Shopify' : dataset?.source === 'case-study' ? 'Real data' : dataset?.source === 'sample' ? 'Demo' : extension ? 'Tableau' : 'File'}</Chip></div>
              <div className="flex items-center justify-between"><span className="text-[var(--muted)]">AI</span><Chip c={health?.ai ? 'var(--fuchsia)' : 'var(--amber)'}>{health?.ai ? health.ai.replace('claude-', '') : 'Deterministic'}</Chip></div>
              <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Tools</span><span className="mono font-semibold">{health?.tools ?? '—'}</span></div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b px-4 py-2.5 backdrop-blur-xl md:px-5" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--bg) 72%, transparent)' }}>
            <div className="flex min-w-0 items-center gap-2">
              <nav.icon size={15} style={{ color: nav.c }} />
              <h1 className="truncate text-[15px] font-extrabold tracking-tight">{nav.label}</h1>
              {dataset && <Chip c={dataset.source === 'sample' ? 'var(--amber)' : dataset.source === 'case-study' ? 'var(--violet)' : dataset.source === 'shopify' ? 'var(--emerald)' : dataset.source === 'tableau' ? 'var(--cyan)' : 'var(--blue)'} pulse={dataset.source === 'shopify' || dataset.source === 'case-study'}>{dataset.source === 'sample' ? 'Demo shop (synthetic)' : dataset.source === 'case-study' ? 'Real data · UK gift shop' : dataset.source === 'shopify' ? 'Live Shopify' : dataset.source === 'tableau' ? 'Live Tableau' : 'Uploaded file'}</Chip>}
              {dataset && dataset.rows !== dataset.totalRows && <Chip c="var(--cyan)"><span className="mono">{dataset.rows.toLocaleString()}</span>/{dataset.totalRows.toLocaleString()} rows</Chip>}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <FilterBar />
              <button className="btn !px-2" onClick={refresh} aria-label="Refresh analysis"><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>
              <ThemeToggle />
            </div>
          </header>
          {/* Enter-only transition: an exit animation would block navigation whenever the browser throttles frames. */}
          <motion.div key={page} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.22 }} className="p-4 md:p-5">
            <Page />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
