import { AnimatePresence, motion } from 'framer-motion';
import { useState, type CSSProperties } from 'react';
import { BookOpen, Brush, Check, ChevronDown, Database, Download, ExternalLink, FileSpreadsheet, Globe2, KeyRound, Lock, PlugZap, RotateCcw, ShoppingBag, Sparkles, Store } from 'lucide-react';
import { post } from '../api';
import { useStore } from '../store';
import { Card, CardHead, Chip, Dropdown, Loading, Tabs, stagger } from '../components/ui';
import { UploadZone } from '../components/Upload';
import TableauPanel from './Connection';
import { go } from '../App';

const RANGES: Record<string, number> = { 'Last 90 days': 90, 'Last 6 months': 183, 'Last 12 months': 365, 'Last 2 years': 730 };
const SHOPIFY = 'var(--emerald)';

function ShopifyConnect() {
  const { refresh, dataset } = useStore();
  const [mode, setMode] = useState<'client' | 'token'>('client');
  const [shop, setShop] = useState(''), [clientId, setClientId] = useState(''), [secret, setSecret] = useState(''), [token, setToken] = useState('');
  const [range, setRange] = useState<string[]>([]), [help, setHelp] = useState(false);
  const [st, setSt] = useState<{ busy?: boolean; ok?: string; err?: string }>({});
  const ready = shop.trim() && (mode === 'client' ? clientId && secret : token);
  const connect = async () => {
    setSt({ busy: true });
    try {
      const r = await post<any>('/api/connect/shopify', { shop, days: RANGES[range[0] ?? 'Last 12 months'], ...(mode === 'client' ? { clientId, clientSecret: secret } : { accessToken: token }) });
      setSecret(''); setToken('');
      setSt({ ok: `Connected ${r.name}: ${r.orders.toLocaleString()} orders, ${r.rows.toLocaleString()} line items` });
      await refresh();
    } catch (e: any) { setSt({ err: e.message }); }
  };
  const live = dataset?.source === 'shopify';
  return (
    <Card c={SHOPIFY} hover={false} className="lg:col-span-7">
      <CardHead icon={<ShoppingBag size={13} />} title="Connect your Shopify store" c={SHOPIFY} right={live ? <Chip c={SHOPIFY} pulse>Live: {dataset?.name}</Chip> : <Chip c="var(--faint)">Not connected</Chip>} />
      <div className="px-2"><Tabs layoutId="shop-mode" value={mode} onChange={setMode} tabs={[{ id: 'client', label: 'Client ID + secret', c: SHOPIFY }, { id: 'token', label: 'Access token', c: 'var(--cyan)' }]} /></div>
      <form onSubmit={(e) => { e.preventDefault(); if (ready) connect(); }} className="space-y-2.5 p-3.5" autoComplete="off">
        <label className="block text-[11px] font-bold text-[var(--muted)]">Store address
          <div className="relative mt-1"><Store size={13} className="absolute left-2.5 top-2 text-[var(--faint)]" /><input className="input w-full pl-8" placeholder="your-store.myshopify.com" value={shop} onChange={(e) => setShop(e.target.value)} /></div>
        </label>
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'client' ? (
            <motion.div key="c" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-bold text-[var(--muted)]">Client ID<input className="input mt-1 w-full" value={clientId} onChange={(e) => setClientId(e.target.value)} /></label>
              <label className="text-[11px] font-bold text-[var(--muted)]">Client secret<input className="input mt-1 w-full" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
            </motion.div>
          ) : (
            <motion.label key="t" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="block text-[11px] font-bold text-[var(--muted)]">Admin API access token
              <input className="input mt-1 w-full" type="password" placeholder="shpat_…" value={token} onChange={(e) => setToken(e.target.value)} />
            </motion.label>
          )}
        </AnimatePresence>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown width={150} c={SHOPIFY} value={range} options={Object.keys(RANGES)} onChange={setRange} placeholder="Last 12 months" />
          <motion.button whileTap={{ scale: 0.96 }} className="btn btn-primary" disabled={!ready || st.busy}><PlugZap size={13} />{st.busy ? 'Connecting' : 'Connect store'}</motion.button>
          <span className="flex items-center gap-1 text-[10.5px] text-[var(--faint)]"><Lock size={10} />Read-only. Keys are used once and never saved.</span>
        </div>
        <div className="min-h-[18px] text-[11.5px]">
          {st.busy && <Loading steps={['Authenticating with Shopify…', 'Pulling orders…', 'Matching product costs…', 'Finding risks…']} />}
          {st.err && <span className="text-[var(--rose)]">{st.err}</span>}
          {st.ok && <span className="flex flex-wrap items-center gap-2 text-[var(--emerald)]"><Check size={12} />{st.ok}<button type="button" className="btn !h-6 text-[10.5px]" onClick={() => go('overview')}>See insights</button></span>}
        </div>
      </form>
      <button onClick={() => setHelp(!help)} className="row-hover flex w-full items-center justify-between border-t px-3.5 py-2.5 text-[12px] font-bold" style={{ borderColor: 'var(--line)' }}>
        <span className="flex items-center gap-1.5"><KeyRound size={13} style={{ color: 'var(--amber)' }} />Where do I get these?</span><ChevronDown size={14} style={{ transform: help ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      <AnimatePresence initial={false}>
        {help && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ol className="space-y-1.5 px-3.5 pb-3.5 text-[11.5px] text-[var(--muted)]">
              {(mode === 'client' ? [
                'Open the Shopify Dev Dashboard and create an app.',
                'Give it access to read orders, read products and read inventory (inventory is what unlocks profit margins).',
                'Install the app on your store.',
                'In the app\'s Settings, copy the Client ID and Client secret here.',
              ] : [
                'Only for stores that already have a custom app made in the Shopify admin (Shopify no longer lets you create new ones there).',
                'Open Apps → Develop apps → your app → API credentials.',
                'Make sure it has read_orders, read_products and read_inventory, then copy the Admin API access token.',
              ]).map((s, i) => <motion.li key={s} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex gap-2"><span className="mono grid h-4 w-4 flex-none place-items-center rounded text-[9.5px] font-bold text-white" style={{ background: SHOPIFY }}>{i + 1}</span>{s}</motion.li>)}
              <li><a className="inline-flex items-center gap-1 font-bold" style={{ color: SHOPIFY }} href="https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant" target="_blank" rel="noreferrer">Shopify's guide<ExternalLink size={11} /></a></li>
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function DataSources() {
  const { dataset, refresh } = useStore();
  const [adv, setAdv] = useState(false);
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <ShopifyConnect />
      <div className="grid gap-3 lg:col-span-5">
        <Card c={SHOPIFY} hover={false}>
          <CardHead icon={<FileSpreadsheet size={13} />} title="No setup: upload a Shopify export" c={SHOPIFY} />
          <ol className="space-y-1 px-3.5 pb-2 text-[11px] text-[var(--muted)]">
            {['In your Shopify admin, open Orders.', 'Click Export (top right).', 'Choose "All orders" and "CSV for Excel, Numbers, or other spreadsheet programs".', 'Click Export orders. Shopify emails you the file (or downloads it).', 'Drop that file below.'].map((s, i) => (
              <li key={s} className="flex gap-2"><span className="mono grid h-4 w-4 flex-none place-items-center rounded text-[9.5px] font-bold text-white" style={{ background: SHOPIFY }}>{i + 1}</span>{s}</li>
            ))}
          </ol>
          <div className="px-3.5 pb-1.5">
            <UploadZone c={SHOPIFY} compact icon={<ShoppingBag size={20} />} title="Drop your Shopify orders export" hint="We spot Shopify's format automatically" />
          </div>
        </Card>
        <Card c="var(--cyan)" hover={false} className="p-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg tint" style={{ '--c': 'var(--cyan)', color: 'var(--cyan)' } as CSSProperties}><Download size={16} /></span>
            <div className="min-w-0 flex-1"><div className="text-[12.5px] font-extrabold">No data handy? Try a real file</div><div className="text-[11px] text-[var(--muted)]">23,266 real sales lines from a UK online shop (customers not in the demo). Download it, then drop it below.</div></div>
            <a className="btn btn-primary flex-none" href="/samples/real-shop-sales-sample.csv" download><Download size={13} />Sample file</a>
          </div>
        </Card>
        <Card c="var(--blue)" hover={false}>
          <CardHead icon={<Database size={13} />} title="Any spreadsheet" c="var(--blue)" />
          <div className="px-3.5 pb-1.5"><UploadZone c="var(--blue)" compact title="Drop a CSV or Excel file" hint="Sales, orders or invoices · needs one money column" /></div>
        </Card>
      </div>

      {dataset?.caseStudyAvailable && <Card c="var(--violet)" hover={false} className="p-3.5 lg:col-span-7">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-lg tint" style={{ '--c': 'var(--violet)', color: 'var(--violet)' } as CSSProperties}><Globe2 size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5"><span className="text-[13px] font-extrabold">Real case study: UK online gift shop</span><Chip c="var(--violet)">Real data</Chip></div>
            <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">Two years of a real online retailer's sales (2009–2011), messy as real data is: returns, duplicates, fees and unknown customers. A 25% sample of customers, from the UCI Machine Learning Repository.</div>
          </div>
          {dataset?.source === 'case-study'
            ? <Chip c="var(--emerald)" pulse><Check size={11} />You're viewing this now</Chip>
            : <button className="btn btn-primary" onClick={async () => { await post('/api/dataset/case-study', {}); refresh(); }}><BookOpen size={13} />Switch to this shop</button>}
        </div>
      </Card>}
      {dataset?.prep && <Card c="var(--amber)" hover={false} className="p-3.5 lg:col-span-5">
        <div className="label mb-2 flex items-center gap-1"><Brush size={11} style={{ color: 'var(--amber)' }} />Cleaned before analysis</div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          {[
            ['Duplicate lines removed', dataset.prep.duplicateRows], ['Return / cancel lines', dataset.prep.returnLines],
            ['Fee & postage lines set aside', dataset.prep.feeLines], ['Zero-price lines removed', dataset.prep.zeroPriceRows],
            ['Sales with no customer', dataset.prep.missingCustomerRows], ['Lines analysed', dataset.prep.keptRows],
          ].map(([k, v], i) => <motion.div key={k as string} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }} className="rounded-md px-2 py-1.5" style={{ background: 'var(--line)' }}><div className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--faint)]">{k}</div><div className="mono text-[13px] font-semibold">{Number(v).toLocaleString()}</div></motion.div>)}
        </div>
      </Card>}

      <Card c="var(--violet)" hover={false} className="p-3.5 lg:col-span-12">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg tint" style={{ '--c': 'var(--violet)', color: 'var(--violet)' } as CSSProperties}><Sparkles size={15} /></span>
          <div className="min-w-0 flex-1"><div className="text-[12.5px] font-extrabold">Currently analysing: {dataset?.name}</div><div className="text-[11px] text-[var(--muted)]">{dataset?.label} · {dataset?.rows.toLocaleString()} rows</div>{dataset?.citation && <div className="mt-0.5 text-[10px] text-[var(--faint)]">Source: {dataset.citation}</div>}</div>
          {dataset?.source !== 'sample' && <button className="btn" onClick={async () => { await post('/api/dataset/sample', {}); refresh(); }}><RotateCcw size={13} />Switch to fake demo shop</button>}
          <button className="btn btn-primary" onClick={() => go('overview')}>See insights</button>
        </div>
      </Card>

      <div className="lg:col-span-12">
        <button onClick={() => setAdv(!adv)} className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)]"><ChevronDown size={14} style={{ transform: adv ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />Advanced: Tableau (beta)</button>
        <AnimatePresence initial={false}>{adv && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 overflow-hidden"><TableauPanel /></motion.div>}</AnimatePresence>
      </div>
    </motion.div>
  );
}
