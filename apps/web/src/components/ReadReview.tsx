import { AnimatePresence, motion } from 'framer-motion';
import { useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  CircleSlash,
  Coins,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Hash,
  Info,
  ListChecks,
  Lock,
  RefreshCw,
  Rows3,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { Issue, Role, Unlock } from '@blindspot/analytics';
import { useStore } from '../store';
import { CountUp, Dropdown, Loading } from './ui';
import { UploadZone } from './Upload';
import { go } from '../App';

const LABEL: Record<Role, string> = {
  date: 'Order date',
  order: 'Order number',
  product: 'Product',
  sku: 'SKU',
  quantity: 'Quantity',
  price: 'Unit price',
  amount: 'Sale amount',
  customer: 'Customer',
  country: 'Country',
  region: 'State / region',
  status: 'Order status',
  currency: 'Currency',
  discount: 'Discount',
  refund: 'Refunded amount',
  cost: 'Unit cost',
  profit: 'Profit',
  category: 'Category',
  cancelled: 'Cancelled at',
};
const MAIN: Role[] = [
  'date',
  'amount',
  'price',
  'quantity',
  'product',
  'customer',
  'order',
  'country',
  'status',
  'cost',
];
const MORE: Role[] = ['sku', 'region', 'category', 'currency', 'discount', 'refund', 'profit'];
const ROLE_C: Partial<Record<Role, string>> = {
  date: 'var(--cyan)',
  amount: 'var(--emerald)',
  price: 'var(--emerald)',
  quantity: 'var(--lime)',
  product: 'var(--violet)',
  customer: 'var(--fuchsia)',
  order: 'var(--blue)',
  country: 'var(--sky)',
  status: 'var(--amber)',
  cost: 'var(--rose)',
};
const NONE = 'Not in my file';
const CURRENCY_CHOICES = [
  'USD · US dollar',
  'EUR · Euro',
  'GBP · British pound',
  'INR · Indian rupee',
  'CAD · Canadian dollar',
  'AUD · Australian dollar',
  'JPY · Japanese yen',
  'CNY · Chinese yuan',
  'CHF · Swiss franc',
  'SEK · Swedish krona',
  'NOK · Norwegian krone',
  'DKK · Danish krone',
  'NZD · New Zealand dollar',
  'SGD · Singapore dollar',
  'HKD · Hong Kong dollar',
  'KRW · South Korean won',
  'MXN · Mexican peso',
  'BRL · Brazilian real',
  'ZAR · South African rand',
  'TRY · Turkish lira',
  'PLN · Polish zloty',
  'AED · UAE dirham',
  'SAR · Saudi riyal',
  'PHP · Philippine peso',
  'IDR · Indonesian rupiah',
  'MYR · Malaysian ringgit',
  'THB · Thai baht',
  'ILS · Israeli shekel',
  'CZK · Czech koruna',
  'HUF · Hungarian forint',
];
const SEV = {
  dropped: { c: 'var(--rose)', icon: CircleSlash, label: 'Left out' },
  kept: { c: 'var(--amber)', icon: AlertTriangle, label: 'Kept' },
  info: { c: 'var(--sky)', icon: Info, label: 'Cleaned' },
};

function RoleCard({ role, i }: { role: Role; i: number }) {
  const { upload, fixUpload } = useStore();
  const rep = upload.report!;
  const col = rep.roles[role],
    conf = rep.confidence[role] ?? (col ? 1 : 0),
    c = ROLE_C[role] ?? 'var(--violet)';
  const fromOther = col?.includes(' (from ');
  const pick = (v: string[]) => {
    const val = v[0];
    const next = { ...upload.overrides, [role]: !val || val === NONE ? null : val };
    fixUpload(next);
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + i * 0.03 }}
      className="rounded-xl border p-2.5"
      style={{
        borderColor: col ? `color-mix(in srgb, ${c} 30%, var(--line))` : 'var(--line)',
        background: col ? `color-mix(in srgb, ${c} 5%, transparent)` : 'transparent',
      }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: col ? c : 'var(--faint)' }}
        >
          {LABEL[role]}
        </span>
        {col ? (
          conf >= 0.9 ? (
            <span className="flex items-center gap-0.5 text-[11px] font-bold text-[var(--emerald)]">
              <Check size={10} />
              {fromOther ? 'Added' : 'Found'}
            </span>
          ) : (
            <span className="text-[11px] font-bold text-[var(--amber)]">Best guess</span>
          )
        ) : (
          <span className="text-[11px] text-[var(--faint)]">—</span>
        )}
      </div>
      {fromOther ? (
        <div
          className="truncate rounded-md px-2 py-1.5 text-[11.5px] font-semibold"
          style={{ background: 'var(--line)' }}
          title={col}
        >
          {col}
        </div>
      ) : (
        <Dropdown
          width="100%"
          c={c}
          value={col ? [col] : []}
          placeholder={NONE}
          options={[NONE, ...rep.columns]}
          onChange={pick}
        />
      )}
      <div className="mt-1 h-[15px] truncate text-[11.5px] text-[var(--faint)]">
        {rep.samples[role]?.length ? rep.samples[role]!.join(' · ') : ''}
      </div>
    </motion.div>
  );
}

function IssueRow({ it, i, onFix }: { it: Issue; i: number; onFix: (mode: 'replace' | 'add') => void }) {
  const s = SEV[it.severity];
  const fixable = it.severity !== 'info' && /^(no-|bad-|possible)/.test(it.kind);
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + i * 0.04 }}
      className="rounded-xl border p-2.5"
      style={{
        borderColor: `color-mix(in srgb, ${s.c} 30%, var(--line))`,
        background: `color-mix(in srgb, ${s.c} 6%, transparent)`,
      }}
    >
      <div className="flex items-start gap-2">
        <s.icon size={14} className="mt-0.5 flex-none" style={{ color: s.c }} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold leading-snug">{it.message}</div>
          {it.lines.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11.5px] text-[var(--muted)]">
              Line{it.lines.length > 1 ? 's' : ''}{' '}
              {it.lines.map((l) => (
                <span key={l} className="mono rounded px-1" style={{ background: 'var(--line)' }}>
                  {l}
                </span>
              ))}
              {it.count > it.lines.length && (
                <span>and {(it.count - it.lines.length).toLocaleString()} more</span>
              )}
            </div>
          )}
        </div>
        <span className="chip flex-none !py-0 !text-[11px]" style={{ '--c': s.c } as CSSProperties}>
          {s.label}
        </span>
      </div>
      {fixable && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
          <button className="btn !h-6 text-[11.5px]" onClick={() => onFix('replace')}>
            <RefreshCw size={11} />
            Upload a fixed file
          </button>
          <button className="btn !h-6 text-[11.5px]" onClick={() => onFix('add')}>
            <FilePlus2 size={11} />
            Add a file with the missing info
          </button>
        </div>
      )}
    </motion.div>
  );
}

function UnlockRow({ u, i }: { u: Unlock; i: number }) {
  const c = u.ok === true ? 'var(--emerald)' : u.ok === 'partial' ? 'var(--amber)' : 'var(--faint)';
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 + i * 0.04 }}
      className="flex items-center gap-2 py-1"
    >
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3 + i * 0.05, type: 'spring' }}
        className="grid h-5 w-5 flex-none place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c }}
      >
        {u.ok === true ? (
          <Check size={11} strokeWidth={3} />
        ) : u.ok === 'partial' ? (
          <span className="text-[11px] font-bold">~</span>
        ) : (
          <Lock size={10} />
        )}
      </motion.span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold" style={{ color: u.ok ? 'var(--text)' : 'var(--muted)' }}>
          {u.label}
        </div>
        <div className="truncate text-[11.5px] text-[var(--faint)]" title={u.note}>
          {u.note}
        </div>
      </div>
    </motion.div>
  );
}

/** Shown after every upload: how each column was read, what was wrong with which rows, and what the file unlocks. */
export function ReadReview() {
  const { upload, setReviewOpen, fixUpload, goBackToFiles } = useStore();
  const [more, setMore] = useState(false),
    [fixMode, setFixMode] = useState<null | 'replace' | 'add'>(null),
    [showInfo, setShowInfo] = useState(false);
  const rep = upload.report;
  if (!upload.open || (!rep && !upload.error && !upload.busy)) return null;
  const close = () => {
    setReviewOpen(false);
    setFixMode(null);
  };
  const problems = rep?.issues.filter((i) => i.severity !== 'info') ?? [];
  const cleaned = rep?.issues.filter((i) => i.severity === 'info') ?? [];
  const failed = !!upload.error;
  const notes = upload.files.map((f) => f.note).filter(Boolean);
  const KIcon = upload.files[0]?.kind === 'pdf' ? FileText : FileSpreadsheet;
  return (
    <AnimatePresence>
      <motion.div
        key="bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] grid place-items-start overflow-y-auto bg-black/55 px-3 py-6 backdrop-blur-sm md:place-items-center"
        onClick={(e) => {
          if (e.target === e.currentTarget && !failed) close();
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="panel relative mx-auto w-full max-w-[980px] overflow-hidden"
          style={{ background: 'var(--panel-solid)' }}
        >
          <div
            className="absolute inset-x-0 top-0 h-[2px]"
            style={{
              background: failed
                ? 'var(--rose)'
                : 'linear-gradient(90deg, var(--emerald), var(--cyan), var(--violet))',
            }}
          />
          {/* header */}
          <div className="flex items-start gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
            <motion.span
              initial={{ rotate: -20, scale: 0.6 }}
              animate={{ rotate: 0, scale: 1 }}
              className="grid h-9 w-9 flex-none place-items-center rounded-xl"
              style={{
                background: `color-mix(in srgb, ${failed ? 'var(--rose)' : 'var(--emerald)'} 18%, transparent)`,
                color: failed ? 'var(--rose)' : 'var(--emerald)',
              }}
            >
              {upload.busy ? (
                <Loading steps={['']} />
              ) : failed ? (
                <AlertTriangle size={17} />
              ) : (
                <ListChecks size={17} />
              )}
            </motion.span>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-extrabold tracking-tight">
                {upload.busy
                  ? 'Reading your file…'
                  : failed
                    ? 'We need your help with this file'
                    : "Here's how we read your file"}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {upload.files.map((f) => (
                  <span
                    key={f.name}
                    className="chip !py-0.5 !text-[11.5px]"
                    style={{ '--c': 'var(--violet)' } as CSSProperties}
                  >
                    <KIcon size={10} />
                    {f.name}
                  </span>
                ))}
                {rep?.files[0]?.format && (
                  <span
                    className="chip !py-0.5 !text-[11.5px]"
                    style={{ '--c': 'var(--cyan)' } as CSSProperties}
                  >
                    <Sparkles size={10} />
                    {rep.format}
                  </span>
                )}
              </div>
            </div>
            {!failed && (
              <button onClick={close} className="btn !h-7 !px-2" aria-label="Close">
                <X size={14} />
              </button>
            )}
          </div>

          {upload.busy && (
            <div className="px-4 py-10">
              <Loading
                className="justify-center"
                steps={[
                  upload.busy,
                  'Finding the header row…',
                  'Working out each column…',
                  'Checking every row…',
                  'Cleaning duplicates and fees…',
                ]}
              />
            </div>
          )}

          {!upload.busy && (
            <div className="grid gap-4 p-4 lg:grid-cols-[1.45fr_1fr]">
              <div className="min-w-0 space-y-4">
                {failed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl border p-3 text-[12.5px]"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--rose) 40%, var(--line))',
                      background: 'color-mix(in srgb, var(--rose) 8%, transparent)',
                    }}
                  >
                    <div className="font-bold text-[var(--rose)]">{upload.error}</div>
                    {rep?.columns && (
                      <div className="mt-1 text-[11.5px] text-[var(--muted)]">
                        Pick the right columns below and Blindspot will read it again instantly.
                      </div>
                    )}
                  </motion.div>
                )}

                {rep && !failed && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      {
                        icon: Rows3,
                        l: 'Rows used',
                        v: rep.rowsUsed,
                        sub: `of ${rep.rowsRead.toLocaleString()} read`,
                        c: 'var(--emerald)',
                      },
                      rep.roles.order || rep.roles.customer
                        ? {
                            icon: Hash,
                            l: 'Orders',
                            v: rep.ordersFound,
                            sub: rep.roles.order ? 'by order number' : 'same customer + day',
                            c: 'var(--blue)',
                          }
                        : { icon: Hash, l: 'Orders', v: null, sub: 'No order numbers', c: 'var(--blue)' },
                      {
                        icon: Calendar,
                        l: 'Dates',
                        v: null,
                        sub: rep.dateRange ? `${rep.dateRange[0]} → ${rep.dateRange[1]}` : 'No dates',
                        c: 'var(--cyan)',
                      },
                      {
                        icon: Coins,
                        l: 'Currency',
                        v: null,
                        sub: rep.currency ?? 'Not stated: pick it below',
                        c: 'var(--amber)',
                      },
                    ].map((x, i) => (
                      <motion.div
                        key={x.l}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="rounded-xl border p-2.5"
                        style={{ borderColor: 'var(--line)' }}
                      >
                        <div
                          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider"
                          style={{ color: x.c }}
                        >
                          <x.icon size={11} />
                          {x.l}
                        </div>
                        {x.v !== null ? (
                          <CountUp value={x.v} className="mt-0.5 block text-[18px] font-semibold" />
                        ) : (
                          <div className="mono mt-0.5 truncate text-[12.5px] font-semibold" title={x.sub}>
                            {x.sub}
                          </div>
                        )}
                        {x.v !== null && <div className="text-[11.5px] text-[var(--faint)]">{x.sub}</div>}
                      </motion.div>
                    ))}
                  </div>
                )}
                {rep?.bridge && !failed && (rep.bridge.leftOut > 0 || rep.bridge.refundRecordsAdded > 0) && (
                  <div
                    className="flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-[var(--muted)]"
                    style={{ background: 'var(--line)' }}
                  >
                    <span className="font-bold text-[var(--text)]">From file to analysis:</span>
                    <span className="mono">{rep.bridge.read.toLocaleString()}</span> rows read
                    {rep.bridge.leftOut > 0 && (
                      <>
                        <ArrowRight size={11} />
                        <span className="mono">{rep.bridge.leftOut.toLocaleString()}</span> left out (see
                        "What Blindspot cleaned up")
                      </>
                    )}
                    <ArrowRight size={11} />
                    <span className="mono">{rep.bridge.saleRecords.toLocaleString()}</span> sale +{' '}
                    <span className="mono">{rep.bridge.returnRecords.toLocaleString()}</span> return records
                    {rep.bridge.refundRecordsAdded > 0 && (
                      <span className="text-[var(--faint)]">
                        ({rep.bridge.refundRecordsAdded.toLocaleString()} returns created from refunded
                        orders)
                      </span>
                    )}
                    <ArrowRight size={11} />
                    <span className="mono font-bold text-[var(--text)]">
                      {rep.bridge.analysed.toLocaleString()}
                    </span>{' '}
                    records analyzed
                  </div>
                )}

                {rep?.columns && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="label flex items-center gap-1">
                        <Wand2 size={11} style={{ color: 'var(--violet)' }} />
                        What each column means
                      </div>
                      <span className="text-[11.5px] text-[var(--faint)]">Wrong? Pick the right column.</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                      {MAIN.map((r, i) => (
                        <RoleCard key={r} role={r} i={i} />
                      ))}
                    </div>
                    <button
                      onClick={() => setMore(!more)}
                      className="mt-2 flex items-center gap-1 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      <ChevronDown
                        size={12}
                        style={{ transform: more ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                      />
                      More columns
                    </button>
                    <AnimatePresence initial={false}>
                      {more && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3 xl:grid-cols-5">
                            {MORE.map((r, i) => (
                              <RoleCard key={r} role={r} i={i} />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {rep && !failed && !rep.currency && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-wrap items-center gap-2 rounded-xl border p-2.5 text-[12.5px]"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--amber) 40%, var(--line))',
                      background: 'color-mix(in srgb, var(--amber) 7%, transparent)',
                    }}
                  >
                    <Coins size={15} style={{ color: 'var(--amber)' }} />
                    <span className="flex-1">
                      <b>Your file doesn't say its currency.</b> Amounts show as plain numbers until you pick
                      it.
                    </span>
                    <Dropdown
                      width={190}
                      c="var(--amber)"
                      value={[]}
                      placeholder="Select currency…"
                      options={CURRENCY_CHOICES}
                      onChange={(v) =>
                        v[0] && fixUpload(upload.overrides, upload.dateOrder, v[0].slice(0, 3))
                      }
                    />
                  </motion.div>
                )}
                {rep?.dateOrderAssumed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-wrap items-center gap-2 rounded-xl border p-2.5 text-[12px]"
                    style={{ borderColor: 'color-mix(in srgb, var(--cyan) 30%, var(--line))' }}
                  >
                    <Calendar size={14} style={{ color: 'var(--cyan)' }} />
                    <span className="flex-1">
                      Dates like <b className="mono">{rep.samples.date?.[0]}</b> could be read two ways. Which
                      is right?
                    </span>
                    {(['mdy', 'dmy'] as const).map((o) => (
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        key={o}
                        onClick={() => fixUpload(upload.overrides, o)}
                        className="btn !h-7 text-[11px]"
                        style={
                          rep.dateOrder === o ? { borderColor: 'var(--cyan)', color: 'var(--cyan)' } : {}
                        }
                      >
                        {rep.dateOrder === o && <Check size={11} />}
                        {o === 'mdy' ? 'Month first (US)' : 'Day first (UK/EU)'}
                      </motion.button>
                    ))}
                  </motion.div>
                )}

                {notes.length > 0 && (
                  <div className="space-y-1">
                    {notes.map((n) => (
                      <div key={n} className="flex items-start gap-1.5 text-[11px] text-[var(--muted)]">
                        <Info size={12} className="mt-0.5 flex-none" style={{ color: 'var(--sky)' }} />
                        {n}
                      </div>
                    ))}
                  </div>
                )}
                {rep?.files && rep.files.length > 1 && (
                  <div className="space-y-1">
                    {rep.files.slice(1).map((f) => (
                      <div key={f.name} className="flex items-start gap-1.5 text-[11px] text-[var(--muted)]">
                        <FilePlus2
                          size={12}
                          className="mt-0.5 flex-none"
                          style={{ color: 'var(--emerald)' }}
                        />
                        <b className="text-[var(--text)]">{f.name}</b>: {f.how}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-4">
                {rep && (
                  <div>
                    <div className="label mb-2 flex items-center gap-1">
                      <AlertTriangle
                        size={11}
                        style={{ color: problems.length ? 'var(--amber)' : 'var(--emerald)' }}
                      />
                      {problems.length
                        ? `${problems.length} thing${problems.length > 1 ? 's' : ''} to know`
                        : 'Every row was usable'}
                    </div>
                    {problems.length === 0 && !failed && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2 rounded-xl border p-3 text-[12px]"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--emerald) 30%, var(--line))',
                          background: 'color-mix(in srgb, var(--emerald) 7%, transparent)',
                        }}
                      >
                        <Check size={15} style={{ color: 'var(--emerald)' }} />
                        No missing dates, amounts or products.
                      </motion.div>
                    )}
                    <div className="space-y-2">
                      {problems.map((it, i) => (
                        <IssueRow key={it.kind} it={it} i={i} onFix={setFixMode} />
                      ))}
                    </div>
                    {cleaned.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowInfo(!showInfo)}
                          className="flex items-center gap-1 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                        >
                          <ChevronDown
                            size={12}
                            style={{
                              transform: showInfo ? 'rotate(180deg)' : 'none',
                              transition: 'transform .2s',
                            }}
                          />
                          What Blindspot cleaned up ({cleaned.length})
                        </button>
                        <AnimatePresence initial={false}>
                          {showInfo && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-1.5 pt-2">
                                {cleaned.map((it, i) => (
                                  <IssueRow key={it.kind} it={it} i={i} onFix={setFixMode} />
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                )}

                {rep?.unlocks && !failed && (
                  <div>
                    <div className="label mb-1 flex items-center gap-1">
                      <Sparkles size={11} style={{ color: 'var(--violet)' }} />
                      What this file unlocks
                    </div>
                    <div className="space-y-0.5">
                      {rep.unlocks.map((u, i) => (
                        <UnlockRow key={u.key} u={u} i={i} />
                      ))}
                    </div>
                    {rep.unlocks.some((u) => !u.ok) && (
                      <button
                        onClick={() => setFixMode('add')}
                        className="mt-1.5 flex items-center gap-1 text-[11px] font-bold"
                        style={{ color: 'var(--emerald)' }}
                      >
                        <FilePlus2 size={12} />
                        Add a file to unlock more
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {!upload.busy && (
            <AnimatePresence>
              {fixMode && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className="mx-4 mb-3 rounded-xl border p-2.5"
                    style={{ borderColor: 'var(--line-strong)' }}
                  >
                    <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-bold">
                      {fixMode === 'add'
                        ? 'Add a file with the missing details (matched by order number, SKU, product or customer)'
                        : 'Upload the fixed file (replaces this one)'}
                      <button onClick={() => setFixMode(null)} aria-label="Cancel">
                        <X size={12} />
                      </button>
                    </div>
                    <UploadZone
                      compact
                      mode={fixMode}
                      c={fixMode === 'add' ? 'var(--emerald)' : 'var(--blue)'}
                      title={fixMode === 'add' ? 'Drop the extra file' : 'Drop the fixed file'}
                      hint="CSV, Excel, Numbers, Google Sheets or PDF"
                      onDone={() => setFixMode(null)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
          {!upload.busy && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="text-[11px] text-[var(--faint)]">
                {failed
                  ? 'Nothing was changed yet.'
                  : problems.some((p) => p.severity !== 'info')
                    ? 'You can continue: anything that needs missing info will say "not enough info".'
                    : 'Everything checks out.'}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={() => {
                    goBackToFiles();
                    setFixMode(null);
                    go('data');
                  }}
                >
                  <ArrowLeft size={13} />
                  Go back
                </button>
                {!failed && (
                  <button className="btn" onClick={() => setFixMode('add')}>
                    <FilePlus2 size={13} style={{ color: 'var(--emerald)' }} />
                    Add another file
                  </button>
                )}
                {!failed && (
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    whileHover={{ scale: 1.02 }}
                    className="btn btn-primary"
                    onClick={() => {
                      close();
                      go('overview');
                    }}
                  >
                    {problems.length ? 'Continue' : 'Looks right'}
                    <ArrowRight size={13} />
                  </motion.button>
                )}
                {failed && (
                  <button className="btn" onClick={close}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
