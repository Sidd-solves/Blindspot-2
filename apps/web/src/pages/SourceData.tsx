import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Search,
  Table2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { get, SID, usd, usdExact } from '../api';
import { useStore, type Drill } from '../store';
import { Card, CardHead, Chip, CountUp, Loading, stagger, fadeUp } from '../components/ui';
import { go } from '../App';

interface Recon {
  expect: { value: number; what: string } | null;
  expectCents: number | null;
  actual: number;
  actualCents: number;
  windows: {
    label: string;
    actual: number;
    actualCents: number;
    expect: number | null;
    expectCents: number | null;
  }[];
}
interface Totals {
  sales: number;
  returns: number;
  orders: number;
  customers: number;
  lines: number;
}
interface Rows {
  recon: Recon | null;
  columns: string[];
  total: number;
  matched: number;
  rows: Record<string, unknown>[];
  measure: string;
  currency: string;
  totals: Totals;
  searchTotals: Totals | null;
  search: string | null;
}
const PAGE = 50;

function CheckTile({
  label,
  mine,
  shown,
  money,
  c,
  i,
  search,
  scopeLabel,
}: {
  label: string;
  mine: number;
  shown: number | undefined;
  money?: boolean;
  c: string;
  i: number;
  search?: number;
  scopeLabel: string;
}) {
  const ok = shown == null || Math.abs(mine - shown) <= Math.max(1, Math.abs(shown) * 0.0005);
  const fmt = (n: number) => (money ? usd(n) : Math.round(n).toLocaleString());
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -2 }}
      className="panel relative overflow-hidden p-3"
      style={{ borderColor: `color-mix(in srgb, ${c} 30%, var(--line))` }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${c}, transparent)` }}
      />
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {shown != null && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4 + i * 0.1, type: 'spring' }}
          >
            {ok ? (
              <Chip c="var(--emerald)">
                <BadgeCheck size={11} />
                Match
              </Chip>
            ) : (
              <Chip c="var(--rose)">
                <TriangleAlert size={11} />
                Differs
              </Chip>
            )}
          </motion.span>
        )}
      </div>
      <CountUp value={mine} format={fmt} className="mono mt-1 block text-[19px] font-semibold" />
      <div className="mt-1 flex items-center justify-between text-[11.5px] text-[var(--faint)]">
        <span>{scopeLabel}</span>
        {search != null ? (
          <span>
            Your search: <span className="mono text-[var(--muted)]">{fmt(search)}</span>
          </span>
        ) : (
          shown != null && (
            <span>
              Overview shows <span className="mono text-[var(--muted)]">{fmt(shown)}</span>
            </span>
          )
        )}
      </div>
    </motion.div>
  );
}

function Recon({
  label,
  actualCents,
  expectCents,
}: {
  label: string;
  actualCents: number;
  expectCents: number | null;
}) {
  const ok = expectCents == null || actualCents === expectCents,
    diff = expectCents == null ? 0 : (actualCents - expectCents) / 100;
  return (
    <Chip c={ok ? 'var(--emerald)' : 'var(--amber)'}>
      {ok ? <BadgeCheck size={11} /> : <TriangleAlert size={11} />}
      {label}: <span className="mono">{usdExact(actualCents / 100)}</span>
      {expectCents != null &&
        (ok ? (
          ' matches to the penny'
        ) : (
          <>
            {' '}
            differs from the finding by <span className="mono">{usdExact(diff)}</span>
          </>
        ))}
    </Chip>
  );
}

export default function SourceData() {
  const { dataset, dash, version } = useStore();
  const [q, setQ] = useState(''),
    [term, setTerm] = useState(''),
    [page, setPage] = useState(0);
  const [data, setData] = useState<Rows | null>(null),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(q);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  // Drill-through from a finding: "?drill=<DrillSpec JSON>" in the address.
  const readDrill = () => {
    try {
      const m = location.hash.match(/[?&]drill=([^&]+)/);
      return m ? (JSON.parse(decodeURIComponent(m[1])) as Drill) : null;
    } catch {
      return null;
    }
  };
  const [drill, setDrill] = useState(readDrill),
    [scope, setScope] = useState<'exact' | 'history'>('exact');
  useEffect(() => {
    const h = () => {
      setDrill(readDrill());
      setPage(0);
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const dq = drill ? `&drill=${encodeURIComponent(JSON.stringify(drill))}&scope=${scope}` : '';
  useEffect(() => {
    let live = true;
    setBusy(true);
    get<Rows>(`/api/rows?offset=${page * PAGE}&limit=${PAGE}&q=${encodeURIComponent(term)}${dq}`)
      .then((d) => {
        if (live) {
          setData(d);
          setBusy(false);
        }
      })
      .catch(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [page, term, version, dq]);

  const kpi = (l: string) => dash?.kpis.find((k) => k.label === l)?.value;
  const pages = data ? Math.max(1, Math.ceil(data.matched / PAGE)) : 1;
  const isMoney = (c: string) => c === data?.measure || /price|cost|profit|revenue|sales|amount/i.test(c);
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
      <motion.div variants={stagger} className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {data ? (
          <>
            <CheckTile
              i={0}
              label={`Total ${data.measure.toLowerCase()}`}
              mine={data.totals.sales}
              search={data.searchTotals?.sales}
              scopeLabel={
                drill
                  ? scope === 'exact'
                    ? 'Rows behind the finding'
                    : 'All related history'
                  : 'Every row analysed'
              }
              shown={drill ? undefined : dash?.kpis[0]?.value}
              money
              c="var(--violet)"
            />
            <CheckTile
              i={1}
              label="Orders"
              mine={data.totals.orders}
              search={data.searchTotals?.orders}
              scopeLabel={
                drill
                  ? scope === 'exact'
                    ? 'Rows behind the finding'
                    : 'All related history'
                  : 'Every row analysed'
              }
              shown={drill ? undefined : kpi('Orders')}
              c="var(--cyan)"
            />
            <CheckTile
              i={2}
              label="Customers"
              mine={data.totals.customers}
              search={data.searchTotals?.customers}
              scopeLabel={
                drill
                  ? scope === 'exact'
                    ? 'Rows behind the finding'
                    : 'All related history'
                  : 'Every row analysed'
              }
              shown={drill ? undefined : kpi('Customers')}
              c="var(--fuchsia)"
            />
            <CheckTile
              i={3}
              label="Rows analysed"
              mine={data.totals.lines}
              search={data.searchTotals?.lines}
              scopeLabel={
                drill
                  ? scope === 'exact'
                    ? 'Rows behind the finding'
                    : 'All related history'
                  : 'Every row analysed'
              }
              shown={drill ? undefined : dataset?.rows}
              c="var(--emerald)"
            />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <div key={i} className="panel h-[88px] animate-pulse" />)
        )}
      </motion.div>

      <AnimatePresence>
        {drill && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px]"
            style={{
              borderColor: 'color-mix(in srgb, var(--sky) 45%, var(--line))',
              background: 'color-mix(in srgb, var(--sky) 8%, transparent)',
            }}
          >
            <Table2 size={15} style={{ color: 'var(--sky)' }} />
            <span className="min-w-0 flex-1">
              Showing <b>{drill.label}</b>: {drill.field} is{' '}
              {drill.values.length === 1 ? (
                <b>{drill.values[0] || '(blank)'}</b>
              ) : (
                <>
                  one of <b>{drill.values.length}</b> values
                </>
              )}
              {scope === 'exact' && drill.rowType && drill.rowType !== 'all' && (
                <>
                  , <b>{drill.rowType} lines</b> only
                </>
              )}
              {scope === 'exact' && drill.windows?.length ? (
                <>, dated {drill.windows.map((w) => w.label.toLowerCase()).join(' or ')}</>
              ) : null}
              {scope === 'history' && <>, every date and row type</>}.
            </span>
            <div className="relative flex rounded-lg border p-0.5" style={{ borderColor: 'var(--line)' }}>
              {(['exact', 'history'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setScope(k);
                    setPage(0);
                  }}
                  className="relative z-10 px-2.5 py-1 text-[11.5px] font-bold"
                  style={{ color: scope === k ? 'var(--text)' : 'var(--muted)' }}
                >
                  {scope === k && (
                    <motion.span
                      layoutId="drill-scope"
                      className="absolute inset-0 -z-10 rounded-md"
                      style={{ background: 'color-mix(in srgb, var(--sky) 22%, transparent)' }}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {k === 'exact' ? 'Rows behind this amount' : 'All related history'}
                </button>
              ))}
            </div>
            <button
              className="btn !h-7 text-[11.5px]"
              onClick={() => {
                location.hash = '/source';
              }}
            >
              <X size={12} />
              Show all rows
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {drill && scope === 'exact' && data?.recon && (data.recon.expect || data.recon.windows.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-1.5 text-[11.5px]"
        >
          <span className="label mr-1">Reconciles to the finding</span>
          {data.recon.windows.map((w) => (
            <Recon key={w.label} label={w.label} actualCents={w.actualCents} expectCents={w.expectCents} />
          ))}
          {data.recon.expect &&
            !data.recon.windows.some((w) => w.expectCents === data.recon!.expectCents) && (
              <Recon
                label={data.recon.expect.what}
                actualCents={data.recon.actualCents}
                expectCents={data.recon.expectCents}
              />
            )}
        </motion.div>
      )}
      <div className="flex flex-wrap gap-1.5 text-[11.5px] text-[var(--muted)]">
        <span className="chip" style={{ '--c': 'var(--violet)' } as any}>
          Sales = every sale line, before returns
        </span>
        <span className="chip" style={{ '--c': 'var(--orange)' } as any}>
          Returns are counted separately, never as sales
        </span>
        <span className="chip" style={{ '--c': 'var(--cyan)' } as any}>
          Orders = orders with at least one sale
        </span>
        <span className="chip" style={{ '--c': 'var(--fuchsia)' } as any}>
          Customers = known customer IDs with at least one sale
        </span>
        <span className="chip" style={{ '--c': 'var(--amber)' } as any}>
          Reversed and duplicate lines are removed first
        </span>
      </div>
      <Card c="var(--sky)" hover={false}>
        <CardHead
          icon={<Table2 size={13} />}
          title="Every row Blindspot analysed"
          c="var(--sky)"
          right={
            <div className="flex items-center gap-1.5">
              {dataset?.prep && (
                <button className="btn !h-7 text-[11px]" onClick={() => go('data')}>
                  What was cleaned
                </button>
              )}
              <a
                className="btn btn-primary !h-7 text-[11px]"
                href={`/api/rows.csv?sid=${SID}${dq}${term ? `&q=${encodeURIComponent(term)}` : ''}`}
                download
                title={
                  term ? 'Downloads only the rows matching your search' : 'Downloads every row in this view'
                }
              >
                <Download size={12} />
                {term ? `Download ${data?.matched.toLocaleString() ?? ''} matching rows` : 'Download CSV'}
              </a>
            </div>
          }
        />
        <div className="flex flex-wrap items-center gap-2 px-3.5 pb-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search size={13} className="absolute left-2.5 top-2 text-[var(--faint)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search any product, customer, order or country…"
              className="input w-full !pl-8"
            />
          </div>
          <span className="text-[11px] text-[var(--muted)]">
            {data ? (
              <>
                <span className="mono font-semibold text-[var(--text)]">{data.matched.toLocaleString()}</span>
                {term && <> of {data.total.toLocaleString()}</>} rows
              </>
            ) : (
              '—'
            )}
          </span>
          {busy && <Loading steps={['Fetching rows…', 'Counting totals…']} />}
        </div>
        {dataset?.citation && (
          <div
            className="mx-3.5 mb-2.5 flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] text-[var(--muted)]"
            style={{ background: 'var(--line)' }}
          >
            <Chip c="var(--violet)">Original source</Chip>
            {dataset.citation}
            <a
              className="inline-flex items-center gap-0.5 font-bold"
              style={{ color: 'var(--violet)' }}
              href="https://archive.ics.uci.edu/dataset/502/online+retail+ii"
              target="_blank"
              rel="noreferrer"
            >
              Open
              <ExternalLink size={10} />
            </a>
          </div>
        )}

        <div className="overflow-x-auto border-t" style={{ borderColor: 'var(--line)' }}>
          <table className="w-full min-w-[720px] text-[11.5px]">
            <thead className="sticky top-0" style={{ background: 'var(--panel-solid)' }}>
              <tr>
                {['#', ...(data?.columns ?? [])].map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: c === data?.measure ? 'var(--violet)' : 'var(--faint)' }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data?.rows.map((r, i) => {
                  const ret = r.IsReturn === 1;
                  return (
                    <motion.tr
                      key={`${page}-${term}-${i}`}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i, 20) * 0.012 }}
                      className="row-hover border-t"
                      style={{
                        borderColor: 'var(--line)',
                        background: ret ? 'color-mix(in srgb, var(--rose) 7%, transparent)' : undefined,
                      }}
                    >
                      <td className="mono px-2.5 py-1.5 text-[var(--faint)]">
                        {(page * PAGE + i + 1).toLocaleString()}
                      </td>
                      {data.columns.map((c) => {
                        const v = r[c];
                        return (
                          <td
                            key={c}
                            className={`max-w-[260px] truncate whitespace-nowrap px-2.5 py-1.5 ${typeof v === 'number' ? 'mono text-right' : ''}`}
                            style={{
                              color:
                                c === data.measure ? (ret ? 'var(--rose)' : 'var(--text)') : 'var(--muted)',
                              fontWeight: c === data.measure ? 600 : 400,
                            }}
                            title={String(v ?? '')}
                          >
                            {c === 'IsReturn' ? (
                              ret ? (
                                <Chip c="var(--rose)">Return</Chip>
                              ) : (
                                <span className="text-[var(--faint)]">Sale</span>
                              )
                            ) : typeof v === 'number' && isMoney(c) ? (
                              v.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            ) : (
                              String(v ?? '')
                            )}
                          </td>
                        );
                      })}
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          {data && !data.rows.length && (
            <div className="py-8 text-center text-[12px] text-[var(--faint)]">No rows match "{term}"</div>
          )}
        </div>
        <div
          className="flex items-center justify-between border-t px-3.5 py-2 text-[11px]"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="text-[var(--faint)]">
            Amounts in the table are exactly as stored ({data?.currency ?? '—'}). Returns are tinted red and
            kept out of sales.
          </span>
          <div className="flex items-center gap-1.5">
            <motion.button
              whileTap={{ scale: 0.92 }}
              className="btn !h-7 !px-2"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={13} />
            </motion.button>
            <span className="mono text-[var(--muted)]">
              {page + 1} / {pages.toLocaleString()}
            </span>
            <motion.button
              whileTap={{ scale: 0.92 }}
              className="btn !h-7 !px-2"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={13} />
            </motion.button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
