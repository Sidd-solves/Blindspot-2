import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BadgeCheck,
  CircleSlash,
  Dices,
  FlaskConical,
  Gavel,
  HelpCircle,
  Megaphone,
  Scale,
} from 'lucide-react';
import { tool, usd } from '../api';
import { useStore } from '../store';
import { Card, CardHead, Chip, Dropdown, Loading, Tabs, stagger } from '../components/ui';
import { ChartTip, axis } from '../components/charts';

type Impact = {
  ok: boolean;
  reason?: string;
  date: string;
  label: string;
  control: 'same-weeks-last-year' | 'none';
  preWeeks: number;
  postWeeks: number;
  effect: number | null;
  actual: number;
  expected: number;
  extra: number;
  p: number | null;
  pTwoSided: number | null;
  method: string;
  verdict: 'rose' | 'fell' | 'no-clear-change' | 'not-enough-data';
  placebo: { tested: number; asBig: number; rate: number | null };
  weekly: { week: string; actual: number; expected: number; phase: 'before' | 'after' }[];
};
type Claim = {
  verdict: 'supported' | 'rejected' | 'small-effect' | 'inconclusive';
  summary: string;
  method: string;
  p: number | null;
  evidence: any;
};

const fmtP = (p: number | null) =>
  p === null ? 'not tested' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`;
const weekLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

function useValues(field: string | null) {
  const { version, dataset } = useStore();
  const [vals, setVals] = useState<string[]>([]);
  useEffect(() => {
    setVals([]);
    if (!field) return;
    tool('query-data', {
      metric: 'sum',
      measure: dataset?.fields.measure,
      groupBy: [field],
      sort: 'desc',
      limit: 40,
    }).then(
      (r) =>
        r.ok &&
        setVals((r.data.rows as any[]).map((row) => String(row[0])).filter((v) => v && v !== '(blank)')),
    );
  }, [field, version]);
  return vals;
}

/* ------------------------------------------------------------------ Was it the promo? */
function PromoTest({ weeks }: { weeks: string[] }) {
  const { dataset } = useStore();
  const fields = useMemo(
    () =>
      [...(dataset?.fields.dims ?? []), ...(dataset?.fields.highCardDims ?? [])].filter(
        (f) => !/^(order|customer|invoice)/i.test(f),
      ),
    [dataset],
  );
  // Weeks that have 8 weeks before and 3 after.
  const pickable = weeks.slice(8, Math.max(8, weeks.length - 3));
  const byLabel = useMemo(() => new Map(pickable.map((w) => [weekLabel(w), w])), [pickable]);
  const [week, setWeek] = useState<string | null>(null),
    [after, setAfter] = useState<'4' | '8' | '12'>('8'),
    [field, setField] = useState<string | null>(null),
    [value, setValue] = useState<string | null>(null),
    [res, setRes] = useState<Impact | null>(null),
    [busy, setBusy] = useState(false);
  const values = useValues(field);
  useEffect(() => {
    if (!week) return;
    setBusy(true);
    tool('event-impact', {
      date: week,
      weeks: Number(after),
      ...(field && value ? { filter: { field, value } } : {}),
    })
      .then((r) => r.ok && setRes(r.data))
      .finally(() => setBusy(false));
  }, [week, after, field, value]);

  const v = res?.verdict;
  // The weekly t-test and the placebo check can disagree on short windows: say so instead of picking one.
  const unusual = v === 'no-clear-change' && !!res && res.placebo.tested >= 10 && res.placebo.asBig === 0;
  const vc =
    v === 'rose'
      ? 'var(--emerald)'
      : v === 'fell'
        ? 'var(--amber)'
        : unusual
          ? 'var(--violet)'
          : 'var(--sky)';
  const data = (res?.weekly ?? []).map((w) => ({ ...w, w: short(w.week) }));
  const firstAfter = data.find((d) => d.phase === 'after')?.w,
    lastAfter = data[data.length - 1]?.w;

  return (
    <Card c="var(--fuchsia)" className="lg:col-span-7" hover={false}>
      <CardHead
        icon={<Megaphone size={13} />}
        title="Was it the promo?"
        c="var(--fuchsia)"
        right={<Chip c="var(--fuchsia)">season controlled</Chip>}
      />
      <div className="space-y-3 px-3.5 pb-3.5">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-[var(--muted)]">I changed something in the week of</span>
          <Dropdown
            value={week ? [weekLabel(week)] : []}
            options={[...byLabel.keys()].reverse()}
            onChange={(x) => setWeek(byLabel.get(x[0]) ?? null)}
            placeholder="Select a week..."
            width={190}
            c="var(--fuchsia)"
          />
          <span className="text-[var(--muted)]">for</span>
          <Dropdown
            value={field ? [field] : []}
            options={['All sales', ...fields]}
            onChange={(x) => {
              setField(x[0] === 'All sales' ? null : x[0]);
              setValue(null);
            }}
            placeholder="All sales"
            width={130}
            c="var(--fuchsia)"
          />
          {field && (
            <Dropdown
              value={value ? [value] : []}
              options={values}
              onChange={(x) => setValue(x[0])}
              placeholder="Select..."
              width={170}
              c="var(--fuchsia)"
            />
          )}
          <span className="text-[var(--muted)]">and judge</span>
          <Tabs
            layoutId="promo-weeks"
            value={after}
            onChange={setAfter}
            tabs={[
              { id: '4', label: '4 wks' },
              { id: '8', label: '8 wks' },
              { id: '12', label: '12 wks' },
            ]}
          />
        </div>

        {!week && (
          <div className="space-y-2">
            <div
              className="tint flex items-center gap-2 rounded-lg p-3 text-[12px] text-[var(--muted)]"
              style={{ '--c': 'var(--fuchsia)' } as CSSProperties}
            >
              <HelpCircle size={14} className="flex-none" style={{ color: 'var(--fuchsia)' }} />
              Pick the week a promotion, price change or new product started.
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                [
                  '1',
                  'Same weeks last year',
                  'Each week is compared with the same week a year earlier, so the season is taken out.',
                ],
                [
                  '2',
                  'Before vs after',
                  'The 8 weeks before your change are tested against the weeks after (Welch t-test).',
                ],
                [
                  '3',
                  'Placebo check',
                  'The same test runs at every other week. If big “effects” happen there too, it says so.',
                ],
              ].map(([n, t, d], i) => (
                <motion.div
                  key={n}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  className="rounded-lg border p-2.5"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <div className="flex items-center gap-1.5 text-[12px] font-bold">
                    <span
                      className="mono grid h-5 w-5 place-items-center rounded-md text-[11px]"
                      style={{
                        color: 'var(--fuchsia)',
                        background: 'color-mix(in srgb, var(--fuchsia) 15%, transparent)',
                      }}
                    >
                      {n}
                    </span>
                    {t}
                  </div>
                  <div className="mt-1 text-[11.5px] leading-snug text-[var(--muted)]">{d}</div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
        {busy && (
          <Loading
            steps={[
              'Lining up the same weeks last year…',
              'Testing before vs after…',
              'Running the placebo check…',
            ]}
          />
        )}
        {res && !busy && !res.ok && <div className="text-[12px] text-[var(--muted)]">{res.reason}</div>}
        <AnimatePresence mode="wait">
          {res && !busy && res.ok && (
            <motion.div
              key={`${res.date}${res.label}${res.postWeeks}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr]">
                <div className="tint rounded-xl p-3" style={{ '--c': vc } as CSSProperties}>
                  <div
                    className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: vc }}
                  >
                    {v === 'no-clear-change' ? <CircleSlash size={12} /> : <BadgeCheck size={12} />}
                    {v === 'rose'
                      ? 'It worked'
                      : v === 'fell'
                        ? 'Sales fell'
                        : unusual
                          ? 'Unusual, not proven'
                          : 'No clear change'}
                  </div>
                  <div className="mt-1 text-[13px] font-bold leading-snug">
                    {unusual
                      ? `${res.label}: ${res.effect! > 0 ? '+' : ''}${(res.effect! * 100).toFixed(0)}% vs the season. No other week moved this much, but ${res.postWeeks} weeks is too few to rule out chance.`
                      : v === 'no-clear-change'
                        ? `${res.label}: ${(res.effect! * 100).toFixed(0)}% vs what the season explains, which could easily be chance.`
                        : `${res.label}: ${res.effect! > 0 ? '+' : ''}${(res.effect! * 100).toFixed(0)}% beyond what the season explains.`}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">
                    {fmtP(res.pTwoSided)} · {res.method}
                  </div>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
                  <div className="text-[11px] text-[var(--muted)]">
                    Sales in the {res.postWeeks} weeks after
                  </div>
                  <div className="mono text-[15px] font-semibold">{usd(res.actual, true)}</div>
                  <div className="text-[11px] text-[var(--muted)]">
                    expected {usd(res.expected, true)} ·{' '}
                    <b style={{ color: res.extra >= 0 ? 'var(--emerald)' : 'var(--amber)' }}>
                      {res.extra >= 0 ? '+' : '−'}
                      {usd(Math.abs(res.extra), true)}
                    </b>
                  </div>
                </div>
                <div
                  className="rounded-xl border p-3"
                  style={{ borderColor: 'var(--line)' }}
                  title="The same test at every other week where nothing was marked."
                >
                  <div className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                    <Dices size={11} /> Placebo check
                  </div>
                  <div className="mono text-[15px] font-semibold">
                    {res.placebo.asBig} of {res.placebo.tested}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    other weeks showed an effect this big by chance
                  </div>
                </div>
              </div>
              <div className="mt-2 h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    {firstAfter && lastAfter && (
                      <ReferenceArea
                        x1={firstAfter}
                        x2={lastAfter}
                        fill="var(--fuchsia)"
                        fillOpacity={0.07}
                      />
                    )}
                    <XAxis dataKey="w" {...axis} minTickGap={14} />
                    <YAxis {...axis} width={50} tickFormatter={(x) => usd(x, true)} />
                    <Tooltip content={<ChartTip fmt={(x: number) => usd(x)} />} />
                    <Bar
                      dataKey="actual"
                      name="Actual"
                      radius={[4, 4, 1, 1]}
                      fill="var(--fuchsia)"
                      fillOpacity={0.75}
                      animationDuration={900}
                    />
                    <Line
                      dataKey="expected"
                      name={res.control === 'none' ? 'Before-date average' : 'Expected from last year'}
                      stroke="var(--cyan)"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      animationDuration={1200}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="text-[11px] text-[var(--faint)]">
                Shaded: the weeks after the change. Dashed: what last year’s same weeks predicted, scaled to
                how this year was running before the change.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Fact-check a claim */
const METRICS = {
  'Average order value': { level: 'order', metric: 'avg' },
  'Total sales': { level: 'row', metric: 'sum' },
  'Number of orders': { level: 'order', metric: 'count' },
} as const;
const VERDICT = {
  supported: { c: 'var(--emerald)', label: 'True', icon: BadgeCheck },
  rejected: { c: 'var(--amber)', label: 'Not true', icon: CircleSlash },
  'small-effect': { c: 'var(--sky)', label: 'True, but tiny', icon: Scale },
  inconclusive: { c: 'var(--faint)', label: 'Not enough evidence', icon: HelpCircle },
} as const;

function FactCheck({ weeks }: { weeks: string[] }) {
  const { dataset } = useStore();
  const fields = useMemo(
    () =>
      [...(dataset?.fields.dims ?? []), ...(dataset?.fields.highCardDims ?? [])].filter(
        (f) => !/^(order|invoice)/i.test(f),
      ),
    [dataset],
  );
  const [mode, setMode] = useState<'group' | 'time'>('group');
  const [metric, setMetric] = useState<keyof typeof METRICS | null>(null),
    [dir, setDir] = useState<'higher' | 'lower' | null>(null),
    [field, setField] = useState<string | null>(null),
    [a, setA] = useState<string | null>(null),
    [b, setB] = useState<string | null>(null),
    [span, setSpan] = useState<'last 90 days' | 'last 6 months'>('last 90 days');
  const [res, setRes] = useState<Claim | null>(null),
    [busy, setBusy] = useState(false);
  const values = useValues(field);
  const end = weeks.length ? weeks[weeks.length - 1] : null;
  const date = dataset?.fields.date ?? 'OrderDate';
  const measure = dataset?.fields.measure ?? 'Sales';

  const claim = useMemo(() => {
    if (!metric || !dir) return null;
    const m = METRICS[metric];
    if (mode === 'group') {
      if (!field || !a || !b) return null;
      const bLabel = b === 'everyone else' ? `everyone else` : `${field} ${b}`;
      return {
        claim: `${metric} is ${dir} for ${field} ${a} than for ${bLabel}`,
        level: m.level,
        metric: m.metric,
        measure,
        a: { label: `${field} ${a}`, filters: [{ field, op: 'eq', value: a }] },
        b: {
          label: bLabel,
          filters: [
            { field, op: b === 'everyone else' ? 'neq' : 'eq', value: b === 'everyone else' ? a : b },
          ],
        },
        expect: dir === 'higher' ? 'a>b' : 'a<b',
      };
    }
    if (!end) return null;
    const days = span === 'last 90 days' ? 90 : 182;
    const e = Date.parse(`${end}T00:00:00Z`) + 7 * 86400000; // the day after the last week in the data starts
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const now = [iso(e - days * 86400000), iso(e)],
      before = [iso(e - (days + 364) * 86400000), iso(e - 364 * 86400000)];
    return {
      claim: `${metric} is ${dir} in the ${span} than in the same days a year earlier`,
      level: m.level,
      metric: m.metric,
      measure,
      a: {
        label: `the ${span}`,
        filters: [
          { field: date, op: 'gte', value: now[0] },
          { field: date, op: 'lt', value: now[1] },
        ],
      },
      b: {
        label: 'the same days a year earlier',
        filters: [
          { field: date, op: 'gte', value: before[0] },
          { field: date, op: 'lt', value: before[1] },
        ],
      },
      expect: dir === 'higher' ? 'a>b' : 'a<b',
    };
  }, [metric, dir, mode, field, a, b, span, end, measure, date]);

  const check = () => {
    if (!claim) return;
    setBusy(true);
    setRes(null);
    tool('test-hypotheses', { hypotheses: [claim], includeLibrary: false, useAI: false })
      .then((r) => r.ok && setRes(r.data.results[0]))
      .finally(() => setBusy(false));
  };
  const V = res ? VERDICT[res.verdict] : null;
  const ev = res?.evidence;
  const maxV = ev?.a && ev?.b ? Math.max(Math.abs(ev.a.value), Math.abs(ev.b.value)) || 1 : 1;

  return (
    <Card c="var(--emerald)" className="lg:col-span-5" hover={false}>
      <CardHead
        icon={<Gavel size={13} />}
        title="Fact-check a claim"
        c="var(--emerald)"
        right={
          <Tabs
            layoutId="fc-mode"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setRes(null);
            }}
            tabs={[
              { id: 'group', label: 'Two groups' },
              { id: 'time', label: 'Now vs last year' },
            ]}
          />
        }
      />
      <div className="space-y-3 px-3.5 pb-3.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] leading-8">
          <Dropdown
            value={metric ? [metric] : []}
            options={Object.keys(METRICS)}
            onChange={(x) => setMetric(x[0] as any)}
            width={170}
            c="var(--emerald)"
          />
          <span className="text-[var(--muted)]">is</span>
          <Dropdown
            value={dir ? [dir] : []}
            options={['higher', 'lower']}
            onChange={(x) => setDir(x[0] as any)}
            width={96}
            c="var(--emerald)"
          />
          {mode === 'group' ? (
            <>
              <span className="text-[var(--muted)]">for</span>
              <Dropdown
                value={field ? [field] : []}
                options={fields}
                onChange={(x) => {
                  setField(x[0]);
                  setA(null);
                  setB(null);
                }}
                width={120}
                c="var(--emerald)"
              />
              {field && (
                <Dropdown
                  value={a ? [a] : []}
                  options={values}
                  onChange={(x) => setA(x[0])}
                  width={150}
                  c="var(--emerald)"
                />
              )}
              <span className="text-[var(--muted)]">than for</span>
              <Dropdown
                value={b ? [b] : []}
                options={['everyone else', ...values.filter((x) => x !== a)]}
                onChange={(x) => setB(x[0])}
                width={140}
                c="var(--emerald)"
              />
            </>
          ) : (
            <>
              <span className="text-[var(--muted)]">in the</span>
              <Dropdown
                value={[span]}
                options={['last 90 days', 'last 6 months']}
                onChange={(x) => setSpan(x[0] as any)}
                width={130}
                c="var(--emerald)"
              />
              <span className="text-[var(--muted)]">than the same days a year earlier</span>
            </>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          disabled={!claim || busy}
          onClick={check}
          className="btn btn-primary !h-8 text-[12px]"
        >
          <FlaskConical size={13} />
          {busy ? 'Checking…' : 'Check it'}
        </motion.button>

        <AnimatePresence mode="wait">
          {res && V && (
            <motion.div
              key={res.summary}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center gap-2">
                <motion.span
                  initial={{ scale: 1.6, rotate: -10, opacity: 0 }}
                  animate={{ scale: 1, rotate: -2, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 15 }}
                  className="flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1 text-[13px] font-extrabold"
                  style={{
                    borderColor: V.c,
                    color: V.c,
                    boxShadow: `0 0 16px color-mix(in srgb, ${V.c} 30%, transparent)`,
                  }}
                >
                  <V.icon size={15} />
                  {V.label}
                </motion.span>
                <span className="text-[11.5px] text-[var(--muted)]">{fmtP(res.p)}</span>
              </div>
              {ev?.a && ev?.b && (
                <div className="mt-2.5 space-y-1.5">
                  {[ev.a, ev.b].map((g: any, i: number) => (
                    <div key={g.label}>
                      <div className="flex justify-between text-[11.5px]">
                        <span className="truncate font-semibold">{g.label}</span>
                        <span className="mono">
                          {metric === 'Number of orders'
                            ? Math.round(g.value).toLocaleString()
                            : usd(g.value)}{' '}
                          <span className="text-[var(--faint)]">n={g.n.toLocaleString()}</span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--line)]">
                        <motion.div
                          className="h-1.5 rounded-full"
                          style={{ background: i ? 'var(--sky)' : V.c }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(Math.abs(g.value) / maxV) * 100}%` }}
                          transition={{ duration: 0.7, delay: 0.1 + i * 0.1 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 text-[11.5px] leading-snug text-[var(--muted)]">{res.summary}</div>
            </motion.div>
          )}
        </AnimatePresence>
        {!res && !busy && (
          <div className="text-[11.5px] text-[var(--faint)]">
            Build the sentence, then check it. The answer comes from a statistical test on your rows, not from
            AI.
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Already checked */
function AlreadyChecked() {
  const { version } = useStore();
  const [rows, setRows] = useState<(Claim & { id: string; claim: string })[] | null>(null);
  useEffect(() => {
    setRows(null);
    tool('test-hypotheses', { useAI: false }).then((r) => r.ok && setRows(r.data.results));
  }, [version]);
  if (!rows) return null;
  return (
    <Card c="var(--lime)" className="lg:col-span-12" hover={false}>
      <CardHead
        icon={<FlaskConical size={13} />}
        title="Already checked for you"
        c="var(--lime)"
        right={<Chip c="var(--lime)">{rows.length} common beliefs, tested</Chip>}
      />
      <div className="grid gap-2 px-3.5 pb-3.5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((h, i) => {
          const V = VERDICT[h.verdict];
          return (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i }}
              whileHover={{ y: -2 }}
              className="tint rounded-lg p-2.5"
              style={{ '--c': V.c } as CSSProperties}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider"
                  style={{ color: V.c }}
                >
                  <V.icon size={12} />
                  {V.label}
                </span>
                <span className="mono text-[10.5px] text-[var(--faint)]">{fmtP(h.p)}</span>
              </div>
              <div className="mt-1 text-[12.5px] font-bold leading-snug">{h.claim}</div>
              <div className="mt-0.5 line-clamp-2 text-[11px] text-[var(--muted)]">{h.summary}</div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

export default function ProveIt() {
  const { version, dataset } = useStore();
  const [weeks, setWeeks] = useState<string[] | null>(null);
  useEffect(() => {
    setWeeks(null);
    tool('query-data', { metric: 'count', timeGrain: 'week', sort: 'key', limit: 500 }).then((r) =>
      setWeeks(
        r.ok
          ? (r.data.rows as any[]).map((row) => String(row[0])).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w))
          : [],
      ),
    );
  }, [version]);
  if (!weeks) return <Loading steps={['Reading your weeks…']} />;
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-3 lg:grid-cols-12"
    >
      <PromoTest weeks={weeks} />
      <FactCheck weeks={weeks} />
      <AlreadyChecked />
      {!dataset?.fields.date && (
        <Card hover={false} className="p-4 text-[12px] text-[var(--muted)] lg:col-span-12">
          These checks need a date column.
        </Card>
      )}
    </motion.div>
  );
}
