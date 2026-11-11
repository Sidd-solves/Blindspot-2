import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Bot, Check, Database, KeyRound, Lock, RotateCcw, Search, ShieldCheck, Wrench, X , ChevronDown } from 'lucide-react';
import { ago, get, post, TOOL_CAT } from '../api';
import { useStore } from '../store';
import { Card, CardHead, Chip, Dropdown, Loading, stagger } from '../components/ui';
import { UploadZone } from '../components/Upload';

const MODEL_LABEL: Record<string, string> = { 'claude-haiku-4-5': 'Haiku 4.5 · fastest, cheapest', 'claude-sonnet-5-5': 'Sonnet 5.5 · balanced (default)', 'claude-opus-5-5': 'Opus 5.5 · most capable' };

export default function Settings() {
  const { refresh, dataset } = useStore();
  const [cfg, setCfg] = useState<any>(null), [tools, setTools] = useState<any[]>([]), [q, setQ] = useState(''), [cat, setCat] = useState<string[]>([]);
  const [up, setUp] = useState<{ msg?: string }>({});
  const [admin, setAdmin] = useState(() => { try { return sessionStorage.getItem('ciq-admin') ?? ''; } catch { return ''; } });
  const [activity, setActivity] = useState<any[]>([]), [adv, setAdv] = useState(false);
  useEffect(() => { get('/api/settings').then(setCfg); get('/api/tools').then(setTools); const load = () => get('/api/activity').then(setActivity).catch(() => {}); load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const filtered = useMemo(() => tools.filter((t) => (!cat.length || cat.includes(t.category)) && (t.name + t.description).toLowerCase().includes(q.toLowerCase())), [tools, q, cat]);
  const security = cfg ? [
    { ok: true, t: 'Zod validation on every tool input and output' }, { ok: true, t: 'Tool allowlist; unknown tools rejected' }, { ok: true, t: 'Rate limits, payload caps, request timeouts' },
    { ok: true, t: 'Secrets server-side only; redacted from errors' }, { ok: true, t: 'Shopify access is read-only' }, { ok: true, t: 'Uploaded files treated as untrusted data' }, { ok: true, t: 'Each visitor gets a private session' },
  ] : [];
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <Card c="var(--fuchsia)" hover={false} className="lg:col-span-4">
        <CardHead icon={<Bot size={13} />} title="AI model" c="var(--fuchsia)" right={cfg && <Chip c={cfg.aiConfigured ? 'var(--emerald)' : 'var(--amber)'} pulse={cfg.aiConfigured}>{cfg.aiConfigured ? 'Key set' : 'No key'}</Chip>} />
        <div className="space-y-2 px-3.5 pb-3.5">
          {cfg ? <Dropdown width={260} c="var(--fuchsia)" value={[MODEL_LABEL[cfg.model]]} options={cfg.models.map((m: string) => MODEL_LABEL[m])} onChange={async (v) => { const id = Object.keys(MODEL_LABEL).find((k) => MODEL_LABEL[k] === v[0]); if (id) setCfg({ ...cfg, ...(await post('/api/settings/model', { model: id })) }); refresh(); }} /> : <Loading steps={['Loading settings…']} />}
          <div className="text-[11px] text-[var(--muted)]">{cfg?.aiConfigured ? 'Chat and vision use this model.' : 'Set ANTHROPIC_API_KEY on the server to enable Claude. Until then the analyst answers from deterministic tools.'}</div>
        </div>
      </Card>

      <Card c="var(--blue)" hover={false} className="lg:col-span-5">
        <CardHead icon={<Database size={13} />} title="Data source" c="var(--blue)" right={<button className="btn !h-7 text-[11px]" onClick={async () => { await post('/api/dataset/sample', {}); setUp({ msg: 'Reset to synthetic demo data' }); refresh(); }}><RotateCcw size={12} />Use demo data</button>} />
        <div className="px-3.5 pb-3.5">
          <UploadZone title="Drop a CSV, Excel or Shopify export" hint="Treated as untrusted data · needs one money column" />
          <div className="text-[11.5px] text-[var(--muted)]">{up.msg ?? `Current: ${dataset?.name} (${dataset?.label})`}</div>
        </div>
      </Card>

      <Card c="var(--emerald)" hover={false} className="p-3.5 lg:col-span-4">
        <div className="label mb-2 flex items-center gap-1"><ShieldCheck size={11} style={{ color: 'var(--emerald)' }} />Security posture</div>
        <div className="space-y-1.5">{security.map((s, i) => <motion.div key={s.t} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-2 text-[11.5px]"><span className="grid h-4 w-4 flex-none place-items-center rounded-full" style={{ background: s.ok ? 'var(--emerald)' : 'var(--amber)' }}>{s.ok ? <Check size={10} color="white" /> : <X size={10} color="white" />}</span><span className={s.ok ? '' : 'text-[var(--muted)]'}>{s.t}{!s.ok && ' (off in dev)'}</span></motion.div>)}</div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">{Object.entries(TOOL_CAT).map(([k, c]) => { const n = tools.filter((t) => t.category === k).length; return n ? <div key={k} className="tint rounded-md px-1.5 py-1 text-center" style={{ '--c': c } as CSSProperties}><div className="mono text-[13px] font-semibold" style={{ color: c }}>{n}</div><div className="truncate text-[11px] font-bold text-[var(--muted)]">{k}</div></div> : null; })}</div>
      </Card>
      <button onClick={() => setAdv(!adv)} className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] lg:col-span-12"><ChevronDown size={14} style={{ transform: adv ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />Advanced (for developers): tools, admin token, activity log</button>
      {adv && <>
      <Card c="var(--amber)" hover={false} className="lg:col-span-3">
        <CardHead icon={<KeyRound size={13} />} title="Admin token" c="var(--amber)" />
        <div className="space-y-2 px-3.5 pb-3.5">
          <input className="input w-full" type="password" placeholder="Paste token (this tab only)" value={admin} onChange={(e) => { setAdmin(e.target.value); try { sessionStorage.setItem('ciq-admin', e.target.value); } catch { /* ignore */ } }} />
          <div className="text-[11.5px] text-[var(--muted)]">Unlocks Tableau-touching tools when ADMIN_TOKEN is set on the server. Kept in session storage only.</div>
        </div>
      </Card>

      <Card c="var(--violet)" hover={false} className="lg:col-span-8">
        <CardHead icon={<Wrench size={13} />} title={`Tool registry · ${tools.length}`} c="var(--violet)" right={<div className="flex gap-1.5"><div className="relative"><Search size={12} className="absolute left-2 top-2 text-[var(--faint)]" /><input className="input w-36 pl-6" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div><Dropdown multi width={130} value={cat} options={Object.keys(TOOL_CAT)} onChange={setCat} placeholder="Category" /></div>} />
        <div className="grid max-h-[380px] gap-1 overflow-y-auto px-2 pb-2 md:grid-cols-2">
          {filtered.map((t, i) => (
            <motion.div key={t.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.015 }} className="row-hover rounded-lg px-2 py-1.5">
              <div className="flex items-center gap-1.5"><span className="h-2 w-2 flex-none rounded-full" style={{ background: TOOL_CAT[t.category], boxShadow: `0 0 6px ${TOOL_CAT[t.category]}` }} /><span className="mono truncate text-[11.5px] font-semibold">{t.name}</span>{!t.core && <Chip c="var(--rose)">Blindspot</Chip>}{t.sensitive && <Lock size={10} className="text-[var(--amber)]" />}</div>
              <div className="line-clamp-2 pl-3.5 text-[11.5px] text-[var(--muted)]">{t.description}</div>
            </motion.div>
          ))}
        </div>
      </Card>

      <Card c="var(--blue)" hover={false} className="lg:col-span-12">
        <CardHead icon={<Wrench size={13} />} title="Recent activity (technical)" c="var(--blue)" right={<Chip c="var(--emerald)" pulse>Live</Chip>} />
        <div className="grid max-h-[180px] gap-x-4 overflow-y-auto px-3 pb-3 md:grid-cols-2">
          {activity.length === 0 && <div className="text-[11.5px] text-[var(--faint)]">No analysis has run yet.</div>}
          {activity.slice(0, 16).map((a, i) => (
            <div key={a.at + a.tool + i} className="flex items-center gap-2 py-0.5 text-[11px]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: a.ok ? 'var(--emerald)' : 'var(--rose)' }} /><span className="mono truncate">{a.tool}</span><span className="mono ml-auto text-[11px] text-[var(--faint)]">{a.ms}ms · {ago(a.at)}</span></div>
          ))}
        </div>
      </Card>
      </>}
    </motion.div>
  );
}
