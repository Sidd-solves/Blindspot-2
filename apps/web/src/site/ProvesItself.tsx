import { motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, BadgeCheck, BellRing, CircleSlash, Gavel, LineChart, PackageX } from 'lucide-react';
import { tool, usd } from '../api';
import { useStore } from '../store';
import { CountUp, Reveal } from '../components/ui';
import { BeamCard } from './Effects';
import { openApp } from './SiteLayout';

/** The predictions and checks, each shown with the proof that it works, live on the current data. */
export function ProvesItself() {
  const { version } = useStore();
  const [fc, setFc] = useState<any>(null),
    [ew, setEw] = useState<any>(null),
    [so, setSo] = useState<any>(null),
    [hy, setHy] = useState<any[]>([]);
  useEffect(() => {
    tool('forecast-sales', { horizon: 3 }).then((r) => setFc(r.ok && r.data.ok ? r.data : null));
    tool('early-warning', { top: 3 }).then((r) => setEw(r.ok && r.data.ok ? r.data : null));
    tool('stock-outs', { top: 3 }).then((r) => setSo(r.ok && r.data.ok ? r.data : null));
    tool('test-hypotheses', { useAI: false }).then((r) =>
      setHy(
        r.ok
          ? r.data.results
              .filter((h: any) => h.verdict === 'supported' || h.verdict === 'rejected')
              .slice(0, 2)
          : [],
      ),
    );
  }, [version]);

  // Forecast mini chart: what it said vs what happened, month by month.
  const bt = fc?.backtest ?? [];
  const hi = Math.max(1, ...bt.flatMap((b: any) => [b.actual, b.predicted]));
  const line = (k: 'actual' | 'predicted') =>
    bt
      .map((b: any, i: number) => `${(i / Math.max(1, bt.length - 1)) * 100},${38 - (b[k] / hi) * 34}`)
      .join(' ');
  const b = ew?.backtest;
  const rate = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
      <Reveal>
        <div className="label" style={{ color: 'var(--cyan)' }}>
          Predictions that prove themselves
        </div>
        <h2 className="mt-1.5 max-w-3xl text-[26px] font-extrabold leading-tight tracking-tight md:text-[34px]">
          Every prediction is tested on the past <span className="grad-text">before you see it.</span>
        </h2>
      </Reveal>
      <div className="mt-5 grid gap-3 md:grid-cols-6">
        {/* Forecast: wide */}
        <Reveal className="md:col-span-4">
          <BeamCard c="var(--cyan)" className="h-full p-4">
            <button
              onClick={() => openApp('forecast')}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-[14px] font-extrabold">
                <LineChart size={16} style={{ color: 'var(--cyan)' }} /> Sales forecast with a track record
              </span>
              <ArrowRight size={14} className="text-[var(--muted)]" />
            </button>
            {fc ? (
              <div className="mt-2 grid items-center gap-4 sm:grid-cols-[1fr_1.4fr]">
                <div>
                  <div className="text-[12px] text-[var(--muted)]">
                    Replayed on the last {fc.accuracy.months} months, it missed by
                  </div>
                  <CountUp
                    value={(fc.accuracy.wape ?? 0) * 100}
                    format={(n) => `${n.toFixed(1)}%`}
                    className="grad-text text-[34px] font-semibold"
                  />
                  <div className="text-[12px] text-[var(--muted)]">
                    on average, using only the data it had at the time.
                  </div>
                </div>
                <svg
                  viewBox="0 0 100 40"
                  className="h-[92px] w-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <clipPath id="pi-reveal">
                      <motion.rect
                        x="0"
                        y="-5"
                        height="50"
                        initial={{ width: 0 }}
                        whileInView={{ width: 100 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.6, ease: 'easeOut' }}
                      />
                    </clipPath>
                  </defs>
                  <g clipPath="url(#pi-reveal)">
                    <polyline
                      points={line('actual')}
                      fill="none"
                      stroke="var(--violet)"
                      strokeWidth={1.8}
                      vectorEffect="non-scaling-stroke"
                    />
                    <polyline
                      points={line('predicted')}
                      fill="none"
                      stroke="var(--amber)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                </svg>
              </div>
            ) : (
              <div className="skeleton mt-3 h-20" />
            )}
            <div className="mt-1 flex gap-3 text-[11px] text-[var(--faint)]">
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-3 rounded" style={{ background: 'var(--violet)' }} /> what happened
              </span>
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-3 rounded" style={{ background: 'var(--amber)' }} /> what it said at
                the time
              </span>
            </div>
          </BeamCard>
        </Reveal>

        {/* Early warning: tall */}
        <Reveal className="md:col-span-2 md:row-span-2">
          <BeamCard c="var(--amber)" className="flex h-full flex-col p-4">
            <button
              onClick={() => openApp('customers')}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-[14px] font-extrabold">
                <BellRing size={16} style={{ color: 'var(--amber)' }} /> Customers worth checking on
              </span>
              <ArrowRight size={14} className="text-[var(--muted)]" />
            </button>
            {b ? (
              <>
                <div className="mt-2 text-[12px] text-[var(--muted)]">
                  Replayed 90 days back. Who stayed away?
                </div>
                {[
                  { l: 'Flagged then', r: rate(b.flaggedStayedAway, b.flagged), c: 'var(--amber)' },
                  { l: 'Everyone else', r: rate(b.othersStayedAway, b.others), c: 'var(--emerald)' },
                ].map((x, i) => (
                  <div key={x.l} className="mt-3">
                    <div className="flex justify-between text-[12px]">
                      <span className="font-bold">{x.l}</span>
                      <span className="mono" style={{ color: x.c }}>
                        {x.r}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-[var(--line)]">
                      <motion.div
                        className="h-2 rounded-full"
                        style={{ background: x.c, boxShadow: `0 0 8px ${x.c}` }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${x.r}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.9, delay: 0.2 + i * 0.15 }}
                      />
                    </div>
                  </div>
                ))}
                <div className="mt-4 space-y-1.5">
                  <div className="label">Reach out first</div>
                  {ew.customers.slice(0, 3).map((c: any, i: number) => (
                    <motion.div
                      key={c.customer}
                      initial={{ opacity: 0, x: 8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="flex items-center justify-between gap-2 text-[12px]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">Customer {c.customer}</span>
                        <span className="block text-[11px] text-[var(--faint)]">
                          {c.silentDays} days since last order
                        </span>
                      </span>
                      <span className="mono flex-none">{usd(c.yearSpend, true)}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-auto pt-4">
                  <CountUp value={ew.total} className="text-[30px] font-semibold" />
                  <div className="text-[12px] text-[var(--muted)]">
                    customers in the warning zone now, worth {usd(ew.valueAtRisk, true)} a year
                  </div>
                </div>
              </>
            ) : (
              <div className="skeleton mt-3 h-40" />
            )}
          </BeamCard>
        </Reveal>

        {/* Stock-outs */}
        <Reveal className="md:col-span-2">
          <BeamCard c="var(--orange)" className="h-full p-4">
            <button
              onClick={() => openApp('stock')}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-[14px] font-extrabold">
                <PackageX size={16} style={{ color: 'var(--orange)' }} /> Unusual sales gaps
              </span>
              <ArrowRight size={14} className="text-[var(--muted)]" />
            </button>
            {so ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <CountUp value={so.found} className="text-[28px] font-semibold" />
                  <span className="text-[12px] text-[var(--muted)]">
                    products with an unusual gap in orders
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {so.items.slice(0, 3).map((i: any) => (
                    <div key={i.product} className="flex justify-between gap-2 text-[11.5px]">
                      <span className="truncate">{i.product}</span>
                      <span className="mono flex-none text-[var(--muted)]">{i.tradingDays}d</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-2 text-[12px] text-[var(--muted)]">Needs a product column.</div>
            )}
          </BeamCard>
        </Reveal>

        {/* Prove it */}
        <Reveal className="md:col-span-2">
          <BeamCard c="var(--lime)" className="h-full p-4">
            <button
              onClick={() => openApp('prove')}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-[14px] font-extrabold">
                <Gavel size={16} style={{ color: 'var(--lime)' }} /> Fact-check any belief
              </span>
              <ArrowRight size={14} className="text-[var(--muted)]" />
            </button>
            <div className="mt-2 space-y-2">
              {hy.map((h, i) => {
                const ok = h.verdict === 'supported';
                const c = ok ? 'var(--emerald)' : 'var(--amber)';
                return (
                  <motion.div
                    key={h.id}
                    initial={{ opacity: 0, scale: 0.94 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 + i * 0.12 }}
                    className="tint rounded-lg p-2"
                    style={{ '--c': c } as CSSProperties}
                  >
                    <div
                      className="flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider"
                      style={{ color: c }}
                    >
                      {ok ? <BadgeCheck size={11} /> : <CircleSlash size={11} />}
                      {ok ? 'Supported' : 'Evidence points the other way'}
                    </div>
                    <div className="text-[12px] font-semibold leading-snug">{h.claim}</div>
                  </motion.div>
                );
              })}
            </div>
          </BeamCard>
        </Reveal>
      </div>
    </section>
  );
}
