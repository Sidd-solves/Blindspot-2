import { AnimatePresence, motion } from 'framer-motion';
import { createElement, useEffect, useState, type CSSProperties } from 'react';
import { Cable, CheckCircle2, Download, Globe, Plug, Radio, RefreshCw, Table2, Terminal, Workflow } from 'lucide-react';
import { ago, tool } from '../api';
import { useStore } from '../store';
import { Card, CardHead, Chip, Empty, Loading, stagger } from '../components/ui';

const TILES = [
  { k: 'tableau', label: 'Tableau extension', icon: Plug, c: 'var(--blue)' },
  { k: 'bridge', label: 'WebSocket bridge', icon: Cable, c: 'var(--cyan)' },
  { k: 'mcp', label: 'MCP tool registry', icon: Workflow, c: 'var(--violet)' },
  { k: 'ai', label: 'AI provider', icon: Radio, c: 'var(--fuchsia)' },
] as const;
const GOOD = ['connected', 'running', 'ok', 'configured'];
const EMBED_SRC = 'https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js';

function Embed() {
  const [url, setUrl] = useState(''), [src, setSrc] = useState(''), [ready, setReady] = useState(false), [err, setErr] = useState('');
  const load = () => {
    if (!/^https:\/\/(public\.tableau\.com|[\w-]+\.online\.tableau\.com|[\w.-]+)\/(views|app\/profile|#\/)/.test(url) && !/^https:\/\/public\.tableau\.com\//.test(url)) return setErr('Paste a Tableau Public or Tableau Cloud view URL (https://…/views/…).');
    setErr('');
    if (!document.querySelector(`script[src="${EMBED_SRC}"]`)) { const s = document.createElement('script'); s.type = 'module'; s.src = EMBED_SRC; s.onload = () => setReady(true); s.onerror = () => setErr('Could not load the Tableau Embedding API.'); document.head.appendChild(s); } else setReady(true);
    setSrc(url);
  };
  return (
    <Card c="var(--blue)" hover={false} className="lg:col-span-8">
      <CardHead icon={<Globe size={13} />} title="Embedded Tableau view" c="var(--blue)" right={<Chip c="var(--blue)">Embedding API v3</Chip>} />
      <div className="px-3.5 pb-3.5">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2"><input className="input flex-1" placeholder="https://public.tableau.com/views/…" value={url} onChange={(e) => setUrl(e.target.value)} /><button className="btn btn-primary">Embed</button></form>
        {err && <div className="mt-1.5 text-[11px] text-[var(--rose)]">{err}</div>}
        <div className="mt-2.5 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)', minHeight: 300 }}>
          {src && ready ? createElement('tableau-viz', { src, toolbar: 'bottom', 'hide-tabs': true, style: { width: '100%', height: 460, display: 'block' } }) : src ? <Loading className="p-4" steps={['Loading Tableau Embedding API…']} /> : <Empty icon={<Globe size={18} />} title="No view embedded">Paste a published view to show it here next to Blindspot's analysis.</Empty>}
        </div>
      </div>
    </Card>
  );
}

function WorksheetLoader({ live }: { live: boolean }) {
  const { refresh } = useStore();
  const [ws, setWs] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState<any>(null);
  const load = async () => { setBusy(true); const r = await tool('get-worksheet-data', { worksheet: ws, loadIntoSession: true }); setRes(r); setBusy(false); if (r.ok) refresh(); };
  return (
    <Card c="var(--emerald)" hover={false} className="lg:col-span-4">
      <CardHead icon={<Table2 size={13} />} title="Load worksheet data" c="var(--emerald)" />
      <div className="space-y-2 px-3.5 pb-3.5">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2"><input className="input flex-1" placeholder="Worksheet name" value={ws} onChange={(e) => setWs(e.target.value)} /><button className="btn btn-primary" disabled={!ws || busy}>{busy ? 'Loading' : 'Load'}</button></form>
        {!live && <div className="text-[11px] text-[var(--amber)]">Extension offline. Loading will report TABLEAU_NOT_CONNECTED until the Blindspot extension runs inside a dashboard.</div>}
        {res && !res.ok && <div className="text-[11.5px] text-[var(--rose)]">{res.error.code}: {res.error.message}</div>}
        {res?.ok && <div className="text-[11.5px] text-[var(--emerald)]">Loaded {res.data.rowCount} rows ({res.data.aggregated ? 'summary data' : 'underlying'}). Every page now analyses this worksheet.</div>}
      </div>
    </Card>
  );
}

export default function Connection() {
  const { conn, extension, events, refresh } = useStore();
  const [checking, setChecking] = useState(false), [live, setLive] = useState<any>(conn), [now, setNow] = useState(Date.now());
  useEffect(() => setLive(conn), [conn]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const test = async () => { setChecking(true); const r = await tool('check-connection'); setLive(r.data); setChecking(false); };
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4">
        {TILES.map((t, i) => {
          const s = live?.[t.k]; const good = s && GOOD.includes(s.status);
          return (
            <Card key={t.k} c={good ? t.c : 'var(--amber)'} className="p-3">
              <div className="flex items-center justify-between"><span className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: t.c, background: `color-mix(in srgb, ${t.c} 15%, transparent)` }}><t.icon size={14} /></span>{s && <span className="pulse-dot" style={{ '--c': good ? 'var(--emerald)' : 'var(--amber)' } as CSSProperties} />}</div>
              <div className="mt-2 text-[12.5px] font-extrabold">{t.label}</div>
              <AnimatePresence mode="wait"><motion.div key={s?.status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[11px]" style={{ color: good ? 'var(--emerald)' : 'var(--amber)' }}>{checking ? 'Testing…' : s?.status.replace('_', ' ') ?? '…'}</motion.div></AnimatePresence>
              <div className="mt-0.5 truncate text-[11.5px] text-[var(--faint)]" title={s?.detail}>{s?.detail}</div>
              {i === 3 && <div className="mt-1" />}
            </Card>
          );
        })}
      </div>
      <div className="flex items-center gap-2 lg:col-span-12"><button className="btn btn-primary" onClick={test} disabled={checking}><RefreshCw size={13} className={checking ? 'spin' : ''} />Test connection</button><button className="btn" onClick={refresh}>Re-run analysis</button><span className="text-[11px] text-[var(--faint)]">Dataset: {live?.dataset?.label}</span></div>

      <Embed />
      <div className="grid gap-3 lg:col-span-4">
        <WorksheetLoader live={extension} />
        <Card c="var(--cyan)" hover={false}>
          <CardHead icon={<Radio size={13} />} title="Bridge events" c="var(--cyan)" right={<Chip c={extension ? 'var(--emerald)' : 'var(--faint)'} pulse={extension}>{extension ? 'Streaming' : 'Idle'}</Chip>} />
          <div className="max-h-[160px] space-y-0.5 overflow-y-auto px-2 pb-2">
            {events.length === 0 && <div className="px-2 pb-2 text-[11px] text-[var(--faint)]">Filter and parameter changes in Tableau appear here in real time.</div>}
            {events.map((e, i) => <motion.div key={e.at + i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 px-1.5 py-1 text-[11px]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--cyan)' }} /><span className="mono font-semibold">{e.name}</span><span className="truncate text-[var(--muted)]">{JSON.stringify(e.payload).slice(0, 40)}</span><span className="mono ml-auto text-[11px] text-[var(--faint)]">{ago(e.at, now)}</span></motion.div>)}
          </div>
        </Card>
      </div>

      <Card c="var(--violet)" hover={false} className="p-3.5 lg:col-span-12">
        <div className="label mb-2 flex items-center gap-1"><Terminal size={11} style={{ color: 'var(--violet)' }} />Connect Tableau in 4 steps</div>
        <div className="grid gap-2 md:grid-cols-4">
          {[
            { t: 'Start Blindspot', d: 'npm run dev starts the API, the bridge on /bridge and this app.', c: 'var(--violet)' },
            { t: 'Serve the extension', d: 'npm run dev -w @blindspot/tableau-extension serves it on :8765.', c: 'var(--blue)' },
            { t: 'Add to a dashboard', d: 'Tableau Desktop → Extension object → Access Local Extensions → blindspot.trex.', c: 'var(--cyan)', dl: true },
            { t: 'Analyse live', d: 'Worksheets, filters and parameters now flow to every page here.', c: 'var(--emerald)' },
          ].map((s, i) => (
            <motion.div key={s.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }} className="tint rounded-lg p-2.5" style={{ '--c': s.c } as CSSProperties}>
              <div className="flex items-center gap-1.5"><span className="mono grid h-5 w-5 place-items-center rounded-md text-[11.5px] font-bold text-white" style={{ background: s.c }}>{i + 1}</span><span className="text-[12px] font-extrabold">{s.t}</span>{i === 3 && extension && <CheckCircle2 size={13} style={{ color: 'var(--emerald)' }} />}</div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">{s.d}</div>
              {s.dl && <a className="btn mt-1.5 !h-6 text-[11.5px]" href="http://127.0.0.1:8765/blindspot.trex" download><Download size={11} />blindspot.trex</a>}
            </motion.div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
