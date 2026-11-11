import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { ArrowLeft, BarChart3, Check, Clock, Copy, CreditCard, Database, Package, ShoppingCart, Square as SquareIcon, Store, ExternalLink, FileSpreadsheet, Lightbulb, Mail, MousePointer2, PlugZap, ShoppingBag, Upload } from 'lucide-react';
import { UploadZone } from '../components/Upload';
import { BeamCard } from './Effects';
import { openApp } from './SiteLayout';

/* ---------- tiny animated mock-ups of each step ---------- */

const Win = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="overflow-hidden rounded-lg border text-[11.5px]" style={{ borderColor: 'var(--line-strong)', background: 'var(--bg2)' }}>
    <div className="flex items-center gap-1 border-b px-2 py-1" style={{ borderColor: 'var(--line)' }}>{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--line-strong)' }} />)}<span className="ml-1.5 font-bold text-[var(--faint)]">{title}</span></div>
    <div className="relative p-2.5">{children}</div>
  </div>
);
const Cursor = ({ x, y }: { x: string; y: string }) => (
  <motion.div className="pointer-events-none absolute" initial={{ left: '10%', top: '85%' }} animate={{ left: ['10%', x, x, x], top: ['85%', y, y, y], scale: [1, 1, 0.8, 1] }} transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 0.6, times: [0, 0.55, 0.7, 0.85] }}>
    <MousePointer2 size={14} fill="white" color="black" />
  </motion.div>
);
const Pulse = ({ c, children }: { c: string; children: ReactNode }) => (
  <motion.span animate={{ boxShadow: [`0 0 0 0 ${c}`, '0 0 0 6px transparent'] }} transition={{ duration: 1.4, repeat: Infinity }} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold text-white" style={{ background: c }}>{children}</motion.span>
);
const Bar = ({ w }: { w: string }) => <span className="block h-1.5 rounded" style={{ width: w, background: 'var(--line-strong)' }} />;

const MOCKS: Record<string, ReactNode> = {
  orders: <Win title="Shopify admin"><div className="flex gap-2"><div className="w-16 space-y-1">{['Home', 'Orders', 'Products', 'Customers'].map((t) => <div key={t} className="rounded px-1 py-0.5" style={{ background: t === 'Orders' ? 'color-mix(in srgb, var(--emerald) 22%, transparent)' : undefined, color: t === 'Orders' ? 'var(--emerald)' : 'var(--faint)', fontWeight: t === 'Orders' ? 700 : 400 }}>{t}</div>)}</div><div className="flex-1 space-y-1.5 pt-1"><Bar w="80%" /><Bar w="60%" /><Bar w="70%" /></div></div><Cursor x="14%" y="34%" /></Win>,
  export: <Win title="Orders"><div className="flex items-center justify-between"><span className="font-bold">Orders</span><Pulse c="var(--emerald)">Export</Pulse></div><div className="mt-2 space-y-1.5"><Bar w="90%" /><Bar w="75%" /><Bar w="85%" /></div><Cursor x="82%" y="22%" /></Win>,
  options: <Win title="Export orders"><div className="space-y-1">{[['All orders', true], ['Current page', false]].map(([t, on]) => <div key={t as string} className="flex items-center gap-1.5"><span className="grid h-2.5 w-2.5 place-items-center rounded-full border" style={{ borderColor: on ? 'var(--emerald)' : 'var(--line-strong)' }}>{on && <span className="h-1 w-1 rounded-full" style={{ background: 'var(--emerald)' }} />}</span><span style={{ color: on ? 'var(--text)' : 'var(--faint)' }}>{t as string}</span></div>)}<div className="mt-1.5 border-t pt-1.5" style={{ borderColor: 'var(--line)' }} />{[['CSV for Excel, Numbers…', true], ['Plain CSV file', false]].map(([t, on]) => <div key={t as string} className="flex items-center gap-1.5"><span className="grid h-2.5 w-2.5 place-items-center rounded-full border" style={{ borderColor: on ? 'var(--emerald)' : 'var(--line-strong)' }}>{on && <span className="h-1 w-1 rounded-full" style={{ background: 'var(--emerald)' }} />}</span><span style={{ color: on ? 'var(--text)' : 'var(--faint)' }}>{t as string}</span></div>)}</div><div className="mt-2 text-right"><Pulse c="var(--emerald)">Export orders</Pulse></div></Win>,
  email: <Win title="Inbox"><motion.div initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2.4 }} className="flex items-center gap-2 rounded px-1.5 py-1" style={{ background: 'color-mix(in srgb, var(--emerald) 12%, transparent)' }}><Mail size={12} style={{ color: 'var(--emerald)' }} /><div className="flex-1"><div className="font-bold">Shopify</div><div className="text-[var(--faint)]">Your order export is ready</div></div><span className="rounded px-1 font-bold" style={{ color: 'var(--emerald)' }}>orders_export.csv</span></motion.div><div className="mt-1.5 space-y-1.5 opacity-50"><Bar w="70%" /><Bar w="55%" /></div></Win>,
  drop: <Win title="Blindspot"><div className="grid place-items-center rounded-md border-2 border-dashed py-3" style={{ borderColor: 'var(--emerald)' }}><motion.div animate={{ y: [-14, 0, 0], opacity: [0, 1, 1] }} transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.8 }} className="flex items-center gap-1 rounded px-1.5 py-0.5 font-bold" style={{ background: 'var(--line-strong)' }}><FileSpreadsheet size={11} style={{ color: 'var(--emerald)' }} />orders_export.csv</motion.div><div className="mt-1 text-[var(--faint)]">Drop here</div></div></Win>,
  devdash: <Win title="Shopify Dev Dashboard"><div className="flex items-center justify-between"><span className="font-bold">Apps</span><Pulse c="var(--cyan)">Create app</Pulse></div><div className="mt-2 space-y-1.5"><Bar w="65%" /><Bar w="50%" /></div><Cursor x="80%" y="22%" /></Win>,
  scopes: <Win title="Access scopes">{['read_orders', 'read_products', 'read_inventory'].map((s, i) => <motion.div key={s} className="mb-1 flex items-center gap-1.5" initial={{ opacity: 0.3 }} animate={{ opacity: [0.3, 1, 1] }} transition={{ delay: i * 0.5, duration: 0.4, repeat: Infinity, repeatDelay: 2.6 }}><span className="grid h-3 w-3 place-items-center rounded" style={{ background: 'var(--cyan)' }}><Check size={9} color="white" strokeWidth={3} /></span><span className="mono">{s}</span></motion.div>)}<div className="mt-1 text-[var(--faint)]">Read-only. Nothing can be changed.</div></Win>,
  install: <Win title="Install app"><div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded" style={{ background: 'color-mix(in srgb, var(--cyan) 22%, transparent)' }}><ShoppingBag size={12} style={{ color: 'var(--cyan)' }} /></span><div className="flex-1"><div className="font-bold">your-store.myshopify.com</div><div className="text-[var(--faint)]">Choose a store</div></div><Pulse c="var(--cyan)">Install</Pulse></div><Cursor x="84%" y="30%" /></Win>,
  keys: <Win title="App settings">{[['Client ID', 'a1b2c3…'], ['Client secret', '••••••••']].map(([k, v]) => <div key={k} className="mb-1 flex items-center gap-1.5"><span className="w-16 text-[var(--faint)]">{k}</span><span className="mono flex-1 rounded px-1 py-0.5" style={{ background: 'var(--line)' }}>{v}</span><motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.2, repeat: Infinity }}><Copy size={11} style={{ color: 'var(--cyan)' }} /></motion.span></div>)}</Win>,
  paste: <Win title="Blindspot · Data Sources"><div className="space-y-1">{['your-store.myshopify.com', 'Client ID', 'Client secret'].map((p, i) => <motion.div key={p} className="rounded border px-1.5 py-0.5" style={{ borderColor: 'var(--line-strong)' }} animate={{ borderColor: ['var(--line-strong)', 'var(--cyan)', 'var(--line-strong)'] }} transition={{ delay: i * 0.4, duration: 1, repeat: Infinity, repeatDelay: 1.6 }}><span className="text-[var(--faint)]">{p}</span></motion.div>)}</div><div className="mt-1.5 text-right"><Pulse c="var(--cyan)"><PlugZap size={10} />Connect store</Pulse></div></Win>,
  table: <Win title="sales.xlsx"><table className="w-full"><thead><tr>{[['Date', 'var(--emerald)'], ['Product', 'var(--blue)'], ['Customer', 'var(--blue)'], ['Amount', 'var(--emerald)']].map(([h, c]) => <th key={h} className="px-1 text-left" style={{ color: c }}>{h}</th>)}</tr></thead><tbody>{[['2026-03-01', 'Mug', 'Ana', '12.50'], ['2026-03-01', 'Candle', 'Raj', '18.00'], ['2026-03-02', 'Mug', 'Lee', '12.50']].map((r, i) => <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.2 }}>{r.map((v, j) => <td key={j} className={`px-1 ${j === 3 ? 'mono' : ''} text-[var(--muted)]`}>{v}</td>)}</motion.tr>)}</tbody></table></Win>,
  exportfrom: <Win title="Your store's admin"><div className="space-y-1">{['Etsy → Shop Manager → Settings → Options → Download data', 'WooCommerce → Analytics → Orders → Download', 'Square → Reports → Sales → Export', 'Google Sheets → File → Download → CSV'].map((t, i) => <motion.div key={t} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="truncate rounded px-1.5 py-0.5" style={{ background: 'var(--line)' }}>{t}</motion.div>)}</div></Win>,
};

/** A click path ("Reports → Sales → Export") that lights up one step at a time. */
function PathMock({ app, path, c }: { app: string; path: string[]; c: string }) {
  return (
    <Win title={app}>
      <div className="flex flex-wrap items-center gap-1">
        {path.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            <motion.span className="rounded px-1.5 py-0.5 font-bold" animate={{ background: ['var(--line)', `color-mix(in srgb, ${c} 30%, transparent)`, 'var(--line)'], color: ['var(--muted)', 'var(--text)', 'var(--muted)'] }} transition={{ delay: i * 0.55, duration: 1.1, repeat: Infinity, repeatDelay: path.length * 0.55 }}>{p}</motion.span>
            {i < path.length - 1 && <span className="text-[var(--faint)]">›</span>}
          </span>
        ))}
      </div>
      <div className="mt-2 space-y-1.5 opacity-60"><Bar w="85%" /><Bar w="65%" /></div>
    </Win>
  );
}

/* ---------- guide content ---------- */

interface Guide { title: string; c: string; icon: ReactNode; time: string; steps: { t: string; d: string; mock: string; path?: [string, string[]] }[]; tips: string[]; action: 'upload-shopify' | 'connect' | 'upload-any'; link?: { label: string; href: string } }

const fileStep = (c: string) => ({ t: 'Drop it into Blindspot', d: 'Drag the file onto the box below. Column names don\'t need to match anything: Blindspot works out which column is the date, the money, the product and the customer.', mock: 'drop' });
const platform = (title: string, c: string, icon: ReactNode, app: string, steps: { t: string; d: string; path: string[] }[], tips: string[], link?: Guide['link']): Guide => ({
  title, c, icon, time: 'About 2 minutes', action: 'upload-any', link,
  steps: [...steps.map((s) => ({ t: s.t, d: s.d, mock: 'path', path: [app, s.path] as [string, string[]] })), fileStep(c)],
  tips: [...tips, 'Your file is analysed privately and is not stored.'],
});

export const GUIDES: Record<string, Guide> = {
  'shopify-export': {
    title: 'Export your orders from Shopify', c: 'var(--emerald)', icon: <FileSpreadsheet size={18} />, time: 'About 2 minutes',
    steps: [
      { t: 'Open Orders', d: 'In your Shopify admin, click Orders in the left menu.', mock: 'orders' },
      { t: 'Click Export', d: 'It\'s at the top right of the Orders page.', mock: 'export' },
      { t: 'Pick the options', d: 'Choose "All orders" and "CSV for Excel, Numbers, or other spreadsheet programs", then click Export orders.', mock: 'options' },
      { t: 'Get the file', d: 'Small stores download it right away. Bigger stores get an email from Shopify with a download link.', mock: 'email' },
      { t: 'Drop it into Blindspot', d: 'Drag the file onto the box below. Blindspot recognises Shopify\'s format by itself.', mock: 'drop' },
    ],
    tips: ['More history means better results: a year or more lets Blindspot compare with the same time last year.', 'Don\'t edit the file first. Blindspot cleans duplicates, refunds and fees itself.', 'Your file is analysed privately and is not stored.'],
    action: 'upload-shopify', link: { label: 'Shopify\'s help page on exporting orders', href: 'https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders' },
  },
  'shopify-connect': {
    title: 'Connect your Shopify store', c: 'var(--cyan)', icon: <PlugZap size={18} />, time: 'About 5 minutes, once',
    steps: [
      { t: 'Create an app', d: 'Open the Shopify Dev Dashboard (dev.shopify.com) and create a new app. It only takes a name.', mock: 'devdash' },
      { t: 'Give it read access', d: 'Add the scopes read_orders, read_products and read_inventory. These can only read, never change anything.', mock: 'scopes' },
      { t: 'Install it on your store', d: 'Release a version, then install the app on your store.', mock: 'install' },
      { t: 'Copy the keys', d: 'In the app\'s Settings, copy the Client ID and Client secret.', mock: 'keys' },
      { t: 'Paste them into Blindspot', d: 'Open Data Sources, enter your store address and the two keys, and click Connect store.', mock: 'paste' },
    ],
    tips: ['Keys are used once to pull your orders and are never saved.', 'Already have an older custom app with an access token (shpat_…)? Use the Access token tab instead.', 'Rather not make an app? The export option above needs no setup at all.'],
    action: 'connect', link: { label: 'Shopify\'s guide to app credentials', href: 'https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant' },
  },
  woocommerce: platform('Export your orders from WooCommerce', 'var(--fuchsia)', <ShoppingCart size={18} />, 'WordPress admin', [
    { t: 'Open order analytics', d: 'In your WordPress admin, go to WooCommerce, then Analytics, then Orders.', path: ['WooCommerce', 'Analytics', 'Orders'] },
    { t: 'Pick the dates', d: 'Set the date range at the top. Choose at least a year if you can.', path: ['Date range', 'Last year'] },
    { t: 'Download', d: 'Click Download above the orders table. Big stores get the file by email.', path: ['Orders', 'Download'] },
  ], ['Each order becomes one row, with its products, customer and total.']),
  etsy: platform('Export your orders from Etsy', 'var(--orange)', <Store size={18} />, 'Etsy Shop Manager', [
    { t: 'Open Download Data', d: 'In Shop Manager, go to Settings, then Options, then the Download Data tab.', path: ['Settings', 'Options', 'Download Data'] },
    { t: 'Choose order items', d: 'Under Orders, pick "Order Items", choose the year (or all), and click Download CSV.', path: ['Order Items', 'Download CSV'] },
  ], ['"Order Items" gives one row per item sold, which lets Blindspot check each product.']),
  square: platform('Export your sales from Square', 'var(--sky)', <SquareIcon size={18} />, 'Square Dashboard', [
    { t: 'Open Transactions', d: 'In your Square Dashboard, go to Transactions.', path: ['Transactions'] },
    { t: 'Pick the dates', d: 'Set the date range. A year or more gives the best results.', path: ['Date range', 'Last year'] },
    { t: 'Export item details', d: 'Click Export and choose "Item Detail CSV" for one row per item sold.', path: ['Export', 'Item Detail CSV'] },
  ], ['Works for in-person and online Square sales.']),
  amazon: platform('Export your orders from Amazon', 'var(--amber)', <Package size={18} />, 'Seller Central', [
    { t: 'Open order reports', d: 'In Seller Central, go to Reports, then Fulfillment, then All Orders.', path: ['Reports', 'Fulfillment', 'All Orders'] },
    { t: 'Request the report', d: 'Choose the date range and click Request .txt Download (or Download). Open it in Excel and save it as CSV if needed.', path: ['Date range', 'Request download'] },
  ], ['Amazon reports can be tab-separated .txt files. Opening one in Excel and saving it as .xlsx or .csv works.']),
  stripe: platform('Export your payments from Stripe', 'var(--violet)', <CreditCard size={18} />, 'Stripe Dashboard', [
    { t: 'Open Payments', d: 'In your Stripe Dashboard, go to Payments (Transactions).', path: ['Payments'] },
    { t: 'Export', d: 'Click Export, choose the date range and the default columns, then Export.', path: ['Export', 'Date range', 'Export'] },
  ], ['Stripe payments usually have no product names, so product checks will be limited.']),
  tableau: {
    title: 'Bring in data from Tableau', c: 'var(--cyan)', icon: <BarChart3 size={18} />, time: 'About 2 minutes', action: 'upload-any',
    steps: [
      { t: 'Open the sheet with your sales', d: 'In Tableau, open the worksheet that shows your sales, ideally one row per order or order line (date, product, customer, amount).', mock: 'path', path: ['Tableau', ['Workbook', 'Sales sheet']] },
      { t: 'Download it as a crosstab', d: 'Tableau Cloud or Server: click Download, then Crosstab, then pick CSV or Excel. Tableau Desktop: Worksheet, then Export, then Crosstab to Excel.', mock: 'path', path: ['Tableau', ['Download', 'Crosstab', 'Excel']] },
      fileStep('var(--cyan)'),
    ],
    tips: ['The more detailed the sheet, the better. A summary with one row per month can only show trends.', 'Advanced: Blindspot also has a live Tableau extension that reads dashboards directly. It\'s in Data Sources under Advanced (beta).', 'Your file is analysed privately and is not stored.'],
  },
  spreadsheet: {
    title: 'Use Excel, Google Sheets or any CSV', c: 'var(--blue)', icon: <Database size={18} />, time: 'About 1 minute',
    steps: [
      { t: 'One row per sale', d: 'Each row is a sale or an order line. It needs at least one money column (amount, total, price). A date column unlocks trends; product, customer and country columns unlock more checks.', mock: 'table' },
      { t: 'Download it', d: 'Most store and payment tools have a download or export button. CSV or Excel is best; a PDF report works too as long as it has real text (not a scanned photo).', mock: 'exportfrom' },
      { t: 'Drop it in', d: 'Drag the file onto the box below. Column names don\'t need to match anything: Blindspot works out which is which.', mock: 'drop' },
    ],
    tips: ['Works with CSV, Excel, Numbers, Google Sheets and PDF files up to 25 MB (about 150,000 rows).', 'Excel workbooks with several sheets: Blindspot picks the sheet with the sales and tells you which.', 'Missing a detail like customers or costs? Add a second file and Blindspot matches it in by order number, SKU or product.', 'Your file is analysed privately and is not stored.'],
    action: 'upload-any',
  },
};

export default function GuidePage({ id }: { id: string }) {
  const g = GUIDES[id] ?? GUIDES['shopify-export'];
  return (
    <section className="mx-auto max-w-4xl px-4 pb-16 pt-6 md:px-6">
      <motion.button initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} onClick={() => { location.hash = '/start'; window.scrollTo({ top: 0 }); }} className="group flex items-center gap-1 text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)]"><ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />All ways to start</motion.button>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260 }} className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${g.c} 18%, transparent)`, color: g.c, boxShadow: `0 0 28px -6px ${g.c}` }}>{g.icon}</motion.span>
        <div><motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-glow text-[26px] font-extrabold tracking-tight md:text-[34px]">{g.title}</motion.h1>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: g.c }}><Clock size={12} />{g.time} · {g.steps.length} steps</div></div>
      </div>

      <div className="relative mt-8">
        <motion.div className="absolute bottom-6 left-[15px] top-4 w-[2px] origin-top rounded md:left-[19px]" style={{ background: `linear-gradient(${g.c}, color-mix(in srgb, ${g.c} 10%, transparent))` }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
        <div className="space-y-4">
          {g.steps.map((s, i) => (
            <motion.div key={s.t} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 220, damping: 26 }} className="relative grid grid-cols-[32px_1fr] gap-3 md:grid-cols-[40px_1fr]">
              <span className="mono relative z-10 grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold text-white md:h-10 md:w-10" style={{ background: g.c, boxShadow: `0 0 18px -2px ${g.c}` }}>{i + 1}</span>
              <BeamCard c={g.c} className="grid items-center gap-3 p-3.5 md:grid-cols-[1fr_260px]">
                <div><div className="text-[15px] font-extrabold">{s.t}</div><p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{s.d}</p></div>
                <div>{s.path ? <PathMock app={s.path[0]} path={s.path[1]} c={g.c} /> : MOCKS[s.mock]}</div>
              </BeamCard>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-6 grid gap-3 md:grid-cols-[1fr_1.1fr]">
        <div className="panel p-4">
          <div className="label mb-2 flex items-center gap-1" style={{ color: 'var(--amber)' }}><Lightbulb size={11} />Good to know</div>
          <ul className="space-y-2 text-[12px] text-[var(--muted)]">{g.tips.map((t) => <li key={t} className="flex gap-2"><Check size={13} className="mt-0.5 flex-none" style={{ color: g.c }} />{t}</li>)}</ul>
          {g.link && <a href={g.link.href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: g.c }}>{g.link.label}<ExternalLink size={11} /></a>}
        </div>
        <BeamCard on c={g.c} className="p-4">
          <div className="label mb-2 flex items-center gap-1" style={{ color: g.c }}><Upload size={11} />Ready?</div>
          {g.action === 'connect'
            ? <div className="space-y-2"><div className="text-[13px] font-bold">Have your Client ID and secret?</div><motion.button whileTap={{ scale: 0.96 }} whileHover={{ scale: 1.02 }} className="btn btn-primary !h-10 w-full justify-center" onClick={() => openApp('data')}><PlugZap size={14} />Connect my store</motion.button></div>
            : <UploadZone c={g.c} icon={g.action === 'upload-shopify' ? <ShoppingBag size={22} /> : undefined} title="Drop your export here" hint="Opens your results as soon as it's done" onDone={() => openApp('overview')} />}
        </BeamCard>
      </motion.div>
    </section>
  );
}

