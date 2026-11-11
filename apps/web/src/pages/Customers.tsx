import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  BellRing,
  Check,
  ChevronDown,
  Copy,
  Download,
  FlaskConical,
  HeartHandshake,
  Mail,
  Radar,
  UserMinus,
} from 'lucide-react';
import { tool, usd } from '../api';
import { useStore } from '../store';
import { Card, CardHead, Chip, CountUp, Empty, Loading, stagger } from '../components/ui';

type EW = {
  ok: boolean;
  reason?: string;
  asOf: string;
  rule: string;
  backtest: {
    asOf: string;
    windowDays: number;
    flagged: number;
    flaggedStayedAway: number;
    others: number;
    othersStayedAway: number;
    p: number | null;
    method: string;
  } | null;
  customers: {
    customer: string;
    orders: number;
    typicalGapDays: number;
    silentDays: number;
    lateBy: number;
    lastOrder: string;
    expectedBy: string;
    yearSpend: number;
  }[];
  total: number;
  valueAtRisk: number;
  spread: { silentDays: number; yearSpend: number; zone: 'active' | 'slipping' | 'lost' }[];
};
type WB = {
  ok: boolean;
  reason?: string;
  cutoff: string;
  customers: {
    customer: string;
    email: string | null;
    orders: number;
    spend: number;
    lastOrder: string;
    daysSilent: number;
    topProducts: string[];
    message: string;
  }[];
  total: number;
};

const ZONE = {
  active: { c: 'var(--emerald)', label: 'Active' },
  slipping: { c: 'var(--amber)', label: 'Slipping (45–90 days)' },
  lost: { c: 'var(--violet)', label: 'Gone quiet (90+ days)' },
} as const;
const day = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const fmtP = (p: number | null) => (p === null ? '' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function csv(rows: (string | number | null)[][]) {
  return rows
    .map((r) =>
      r
        .map((v) =>
          v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v),
        )
        .join(','),
    )
    .join('\n');
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Every repeat customer as a dot on a "days since last order" line, sized by spend. */
function RhythmStrip({ spread }: { spread: EW['spread'] }) {
  const max = Math.max(1, ...spread.map((s) => s.yearSpend));
  // Deterministic vertical jitter so dots don't stack (no randomness: same picture every load).
  const dots = useMemo(
    () =>
      spread.map((s, i) => ({
        ...s,
        x: (s.silentDays / 180) * 100,
        y: 18 + ((i * 37) % 64),
        r: 2 + Math.sqrt(s.yearSpend / max) * 6,
      })),
    [spread, max],
  );
  return (
    <div className="relative h-[120px]">
      {[
        [0, 25, 'active'],
        [25, 50, 'slipping'],
        [50, 100, 'lost'],
      ].map(([a, b, z]) => (
        <div
          key={z as string}
          className="absolute inset-y-0"
          style={{
            left: `${a}%`,
            width: `${(b as number) - (a as number)}%`,
            background: `linear-gradient(180deg, color-mix(in srgb, ${ZONE[z as keyof typeof ZONE].c} 10%, transparent), transparent)`,
          }}
        />
      ))}
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {[25, 50].map((x) => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1={0}
            y2={100}
            stroke="var(--line-strong)"
            strokeDasharray="1.5 1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {dots.map((d, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          title={`${d.silentDays} days since last order · ${usd(d.yearSpend)} last year`}
          style={{
            left: `calc(${d.x}% - ${d.r}px)`,
            top: `calc(${d.y}% - ${d.r}px)`,
            width: d.r * 2,
            height: d.r * 2,
            background: ZONE[d.zone].c,
            opacity: d.zone === 'active' ? 0.45 : 0.85,
            boxShadow: d.zone === 'slipping' ? `0 0 6px ${ZONE.slipping.c}` : undefined,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: d.zone === 'active' ? 0.45 : 0.85 }}
          transition={{ delay: Math.min(1.2, (d.silentDays / 180) * 1.2), duration: 0.35 }}
        />
      ))}
      <div className="absolute -bottom-4 left-0 right-0 text-[10px] text-[var(--faint)]">
        <span className="absolute left-0">0 days</span>
        <span className="absolute -translate-x-1/2" style={{ left: '25%' }}>
          45
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: '50%' }}>
          90
        </span>
        <span className="absolute right-0">180 days since last order</span>
      </div>
    </div>
  );
}

export default function Customers() {
  const { version, dataset } = useStore();
  const [ew, setEw] = useState<EW | null>(null),
    [wb, setWb] = useState<WB | null>(null);
  const [shop, setShop] = useState(''),
    [open, setOpen] = useState<string | null>(null),
    [copied, setCopied] = useState<string | null>(null),
    [all, setAll] = useState(false);
  useEffect(() => {
    setEw(null);
    tool('early-warning', { top: 200 }).then((r) => r.ok && setEw(r.data));
  }, [version]);
  useEffect(() => {
    const t = setTimeout(
      () => tool('win-back-list', { shopName: shop.trim() || 'our shop' }).then((r) => r.ok && setWb(r.data)),
      shop ? 300 : 0,
    );
    return () => clearTimeout(t);
  }, [version, shop]);

  if (!ew || !wb)
    return (
      <Loading
        steps={[
          'Grouping sales into orders per customer…',
          'Measuring days since each last order…',
          'Replaying the warning 90 days back…',
          'Building the win-back list…',
        ]}
      />
    );
  if (!ew.ok && !wb.ok)
    return (
      <Card hover={false} className="p-6">
        <Empty icon={<Radar size={22} />} title="No customer history to read">
          {ew.reason ?? wb.reason}
        </Empty>
      </Card>
    );

  const b = ew.backtest;
  const flagRate = b ? pctOf(b.flaggedStayedAway, b.flagged) : 0,
    otherRate = b ? pctOf(b.othersStayedAway, b.others) : 0;
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked; the text is still visible to copy by hand */
    }
  };
  const shownWarn = all ? ew.customers : ew.customers.slice(0, 10);

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-3 lg:grid-cols-12"
    >
      {/* Slipping away */}
      <Card c="var(--amber)" className="lg:col-span-4" hover={false}>
        <CardHead
          icon={<BellRing size={13} />}
          title="Slipping away now"
          c="var(--amber)"
          right={
            <Chip c="var(--amber)" pulse>
              Early warning
            </Chip>
          }
        />
        <div className="px-3.5 pb-3.5">
          <div className="flex items-baseline gap-2">
            <CountUp value={ew.total} className="text-[30px] font-semibold" />
            <span className="text-[12px] text-[var(--muted)]">repeat customers, 45–90 days silent</span>
          </div>
          <div className="text-[12px] text-[var(--muted)]">
            They spent{' '}
            <CountUp
              value={ew.valueAtRisk}
              format={(n) => usd(n)}
              className="font-semibold text-[var(--text)]"
            />{' '}
            in the last year.
          </div>
          <div className="mt-2.5 text-[11.5px] leading-snug text-[var(--faint)]">{ew.rule}</div>
        </div>
      </Card>

      {/* Proof */}
      <Card c="var(--emerald)" className="lg:col-span-4" hover={false}>
        <CardHead
          icon={<FlaskConical size={13} />}
          title="Did the warning work before?"
          c="var(--emerald)"
          right={
            b?.p !== null &&
            b?.p !== undefined && <Chip c={b.p < 0.05 ? 'var(--emerald)' : 'var(--faint)'}>{fmtP(b.p)}</Chip>
          }
        />
        {b && b.flagged ? (
          <div className="space-y-2 px-3.5 pb-3.5">
            <div className="text-[11.5px] text-[var(--muted)]">
              Replayed on <b className="text-[var(--text)]">{day(b.asOf)}</b> with only earlier orders. Who
              stayed away the next {b.windowDays} days?
            </div>
            {[
              { l: 'Flagged then', n: b.flagged, r: flagRate, c: 'var(--amber)' },
              { l: 'Everyone else', n: b.others, r: otherRate, c: 'var(--emerald)' },
            ].map((x, i) => (
              <div key={x.l}>
                <div className="mb-0.5 flex justify-between text-[12px]">
                  <span className="font-bold">
                    {x.l} <span className="font-normal text-[var(--faint)]">({x.n.toLocaleString()})</span>
                  </span>
                  <span className="mono font-semibold" style={{ color: x.c }}>
                    {x.r}% stayed away
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--line)]">
                  <motion.div
                    className="h-2 rounded-full"
                    style={{ background: x.c, boxShadow: `0 0 8px ${x.c}` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${x.r}%` }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.15 }}
                  />
                </div>
              </div>
            ))}
            <div className="text-[11.5px] text-[var(--muted)]">
              {flagRate > otherRate ? (
                <>
                  Flagged customers were{' '}
                  <b className="text-[var(--text)]">{(flagRate / Math.max(1, otherRate)).toFixed(1)}×</b> as
                  likely to leave (two-proportion z-test, one-sided).
                </>
              ) : (
                <>
                  On this data the warning did not beat chance, so treat the list as a reminder, not a
                  prediction.
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="px-3.5 pb-3.5 text-[12px] text-[var(--muted)]">
            Not enough repeat customers 90 days ago to test the warning.
          </div>
        )}
      </Card>

      {/* Already gone */}
      <Card c="var(--violet)" className="lg:col-span-4" hover={false}>
        <CardHead icon={<UserMinus size={13} />} title="Best customers who went quiet" c="var(--violet)" />
        <div className="px-3.5 pb-3.5">
          <div className="flex items-baseline gap-2">
            <CountUp value={wb.customers.length} className="text-[30px] font-semibold" />
            <span className="text-[12px] text-[var(--muted)]">top customers, no order in 90 days</span>
          </div>
          <div className="text-[12px] text-[var(--muted)]">
            <CountUp value={wb.total} format={(n) => usd(n)} className="font-semibold text-[var(--text)]" />{' '}
            in the year before they went quiet.
          </div>
          {wb.customers.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[
                [
                  'Orders each',
                  (wb.customers.reduce((x, c) => x + c.orders, 0) / wb.customers.length).toFixed(1),
                ],
                ['Avg spend', usd(wb.total / wb.customers.length, true)],
                ['Longest silent', `${Math.max(...wb.customers.map((c) => c.daysSilent))} days`],
              ].map(([l, v], i) => (
                <motion.div
                  key={l}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.07 }}
                  className="tint rounded-lg px-2 py-1.5"
                  style={{ '--c': 'var(--violet)' } as CSSProperties}
                >
                  <div className="text-[10.5px] text-[var(--muted)]">{l}</div>
                  <div className="mono text-[13px] font-semibold">{v}</div>
                </motion.div>
              ))}
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="btn btn-primary !h-7 text-[11.5px]"
              disabled={!wb.customers.length}
              onClick={() =>
                download(
                  'win-back-list.csv',
                  csv([
                    [
                      'Customer',
                      'Email',
                      'Orders in the year',
                      'Spend',
                      'Last order',
                      'Days silent',
                      'Usually bought',
                      'Draft message',
                    ],
                    ...wb.customers.map((c) => [
                      c.customer,
                      c.email,
                      c.orders,
                      c.spend,
                      c.lastOrder,
                      c.daysSilent,
                      c.topProducts.join('; '),
                      c.message,
                    ]),
                  ]),
                )
              }
            >
              <Download size={12} />
              Download the list
            </motion.button>
            {wb.customers.some((c) => c.email) && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                className="btn !h-7 text-[11.5px]"
                onClick={() =>
                  copy(
                    'emails',
                    wb.customers
                      .filter((c) => c.email)
                      .map((c) => c.email)
                      .join(', '),
                  )
                }
              >
                {copied === 'emails' ? <Check size={12} /> : <Mail size={12} />}
                {copied === 'emails' ? 'Copied' : 'Copy all emails'}
              </motion.button>
            )}
          </div>
        </div>
      </Card>

      {/* Rhythm */}
      <Card c="var(--cyan)" className="lg:col-span-12" hover={false}>
        <CardHead
          icon={<Radar size={13} />}
          title="Every repeat customer, by days since their last order"
          c="var(--cyan)"
          right={
            <div className="flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
              {Object.entries(ZONE).map(([k, z]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: z.c }} />
                  {z.label}
                </span>
              ))}
              <span className="text-[var(--faint)]">· dot size = last-year spend</span>
            </div>
          }
        />
        <div className="px-4 pb-7 pt-1">
          <RhythmStrip spread={ew.spread} />
        </div>
      </Card>

      {/* Early-warning list */}
      <Card c="var(--amber)" className="lg:col-span-6" hover={false}>
        <CardHead
          icon={<BellRing size={13} />}
          title="Reach out before they're gone"
          c="var(--amber)"
          right={<Chip c="var(--amber)">by last-year spend</Chip>}
        />
        <div className="px-3.5 pb-3">
          {!ew.customers.length && (
            <div className="py-4 text-[12px] text-[var(--muted)]">
              Nobody is in the 45–90 day zone right now.
            </div>
          )}
          {shownWarn.map((c, i) => (
            <motion.div
              key={c.customer}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * i }}
              className="grid grid-cols-[minmax(0,1fr)_1.2fr_auto] items-center gap-3 border-b py-1.5 text-[12px] last:border-0"
              style={{ borderColor: 'var(--line)' }}
              title={`Usually orders every ${c.typicalGapDays} days; expected around ${day(c.expectedBy)}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{c.customer}</span>
                <span className="block text-[11px] text-[var(--faint)]">
                  {c.orders} orders · usually every {c.typicalGapDays} days
                </span>
              </span>
              <span>
                <span className="relative block h-1.5 rounded-full bg-[var(--line)]">
                  <span
                    className="absolute inset-y-0 rounded-full"
                    style={{ left: '50%', width: '1px', background: 'var(--line-strong)' }}
                  />
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ background: 'linear-gradient(90deg, var(--emerald), var(--amber))' }}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.min(100, (c.silentDays / 90) * 50 + (c.silentDays > 90 ? 50 : 0))}%`,
                    }}
                    transition={{ duration: 0.7, delay: 0.1 + 0.04 * i }}
                  />
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                  <b className="text-[var(--text)]">{c.silentDays} days</b> since {day(c.lastOrder)}
                </span>
              </span>
              <span className="mono text-right font-semibold">{usd(c.yearSpend, true)}</span>
            </motion.div>
          ))}
          {ew.customers.length > 10 && (
            <div className="mt-2 flex gap-1.5">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setAll(!all)}
                className="btn !h-7 flex-1 justify-center text-[11.5px]"
              >
                {all ? 'Show the top 10' : `Show all ${ew.customers.length}`}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                className="btn !h-7 text-[11.5px]"
                onClick={() =>
                  download(
                    'early-warning.csv',
                    csv([
                      [
                        'Customer',
                        'Orders',
                        'Usual gap (days)',
                        'Days silent',
                        'Last order',
                        'Expected by',
                        'Last-year spend',
                      ],
                      ...ew.customers.map((c) => [
                        c.customer,
                        c.orders,
                        c.typicalGapDays,
                        c.silentDays,
                        c.lastOrder,
                        c.expectedBy,
                        c.yearSpend,
                      ]),
                    ]),
                  )
                }
              >
                <Download size={12} />
                CSV
              </motion.button>
            </div>
          )}
        </div>
      </Card>

      {/* Win-back list with messages */}
      <Card c="var(--violet)" className="lg:col-span-6" hover={false}>
        <CardHead
          icon={<HeartHandshake size={13} />}
          title="Win-back list, ready to send"
          c="var(--violet)"
          right={
            <input
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              placeholder="Your shop name"
              maxLength={80}
              className="input !h-7 w-[150px] text-[11.5px]"
              aria-label="Shop name used in the messages"
            />
          }
        />
        <div className="px-3.5 pb-3">
          {!wb.ok && <div className="py-4 text-[12px] text-[var(--muted)]">{wb.reason}</div>}
          {wb.customers.map((c, i) => {
            const isOpen = open === c.customer;
            return (
              <motion.div
                key={c.customer}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i }}
                className="border-b last:border-0"
                style={{ borderColor: 'var(--line)' }}
              >
                <button
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-1.5 text-left text-[12px]"
                  onClick={() => setOpen(isOpen ? null : c.customer)}
                  aria-expanded={isOpen}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.email ?? c.customer}</span>
                    <span className="block truncate text-[11px] text-[var(--faint)]">
                      {c.orders} orders · last {day(c.lastOrder)} · {c.topProducts[0] ?? ''}
                    </span>
                  </span>
                  <span className="mono font-semibold">{usd(c.spend, true)}</span>
                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="text-[var(--muted)]">
                    <ChevronDown size={13} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="tint mb-2 rounded-lg p-2.5"
                        style={{ '--c': 'var(--violet)' } as CSSProperties}
                      >
                        <div className="mb-1 text-[11px] text-[var(--muted)]">
                          Usually bought: {c.topProducts.join(' · ') || 'not recorded'}
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-[12px] leading-snug">
                          {c.message}
                        </pre>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          className="btn mt-2 !h-7 text-[11.5px]"
                          onClick={() => copy(c.customer, c.message)}
                        >
                          {copied === c.customer ? <Check size={12} /> : <Copy size={12} />}
                          {copied === c.customer ? 'Copied' : 'Copy message'}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          <div className="mt-2 text-[11px] text-[var(--faint)]">
            Nothing is sent from Blindspot. Copy a message into your own email, or download the list.
            {dataset?.source === 'case-study' &&
              ' The UK shop’s customer IDs are anonymous, so there are no emails here.'}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
