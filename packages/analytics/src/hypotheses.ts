import type { Dataset, Row } from './types';
import { detectFields } from './profile';
import { comparisonWindows, inWin, toMs, bucket, pickWindowDays } from './time';
import { mean, round, sum, pearson, welchTest, bootstrapTest, normCdf, tCdf, fmtP, corrTest, type TestResult } from './stats';
import { money, pctStr } from './money';
import type { Filter } from './query';

/**
 * Layer 3: "AI suggests, math checks." Every hypothesis, whether from this built-in library or
 * proposed by the AI, is tested with real calculations and reported only with its verdict.
 */
/**
 * supported: significant and in the claimed direction, big enough to matter.
 * rejected: the evidence points the other way (significant, opposite direction), or a descriptive check failed.
 * small-effect: real (significant, right direction) but below the practical threshold.
 * inconclusive: not enough evidence either way. Verdicts describe THIS dataset only.
 */
export type Verdict = 'supported' | 'rejected' | 'small-effect' | 'inconclusive';
export interface HypothesisResult {
  id: string; claim: string; source: 'library' | 'ai'; verdict: Verdict; summary: string;
  /** 'tested' = a significance test with a p-value; 'descriptive' = a rule-of-thumb check on counts or shares. */
  basis: 'tested' | 'descriptive'; method: string;
  /** The p-value the verdict was decided on (one-sided, in the direction stated by the claim before testing). */
  p: number | null;
  /** The two-sided p-value of the same test, for reference. */
  pTwoSided?: number | null;
  /** What the decision p-value tests, e.g. "one-sided: A > B". */
  alternative?: string | null;
  stat: { name: string; value: number | null } | null; evidence: Record<string, unknown>;
}

/** Generic, AI-proposable test: compare a metric between two filtered groups. */
export interface GenericHypothesis {
  claim: string; level: 'row' | 'order'; metric: 'avg' | 'sum' | 'count'; measure: string;
  a: { label: string; filters: Filter[] }; b: { label: string; filters: Filter[] };
  expect: 'a>b' | 'a<b'; minEffect?: number;
}

const UNKNOWN = new Set(['Unknown customer', 'Guest checkout', '']);
const ISO = /^\d{4}-\d{2}(-\d{2})?/;
const match = (r: Row, fs: Filter[]) => fs.every((f) => {
  const v = r[f.field];
  // Dates compare as ISO strings ("2011-11-01" < "2011-12-01"); everything else numerically.
  const isDate = typeof v === 'string' && ISO.test(v);
  const n: any = isDate ? v : Number(v), cmp = (x: unknown) => (isDate ? String(x) : Number(x));
  switch (f.op) {
    case 'eq': return String(v) === String(f.value); case 'neq': return String(v) !== String(f.value);
    case 'in': return Array.isArray(f.value) && f.value.map(String).includes(String(v)); case 'nin': return Array.isArray(f.value) && !f.value.map(String).includes(String(v));
    case 'gt': return n > cmp(f.value); case 'gte': return n >= cmp(f.value); case 'lt': return n < cmp(f.value); case 'lte': return n <= cmp(f.value);
    case 'contains': return String(v ?? '').toLowerCase().includes(String(f.value).toLowerCase());
    case 'between': return Array.isArray(f.value) && n >= cmp(f.value[0]) && n <= cmp(f.value[1]);
  }
});

function orderTotals(rows: Row[], measure: string) {
  const m = new Map<string, number>();
  for (const r of rows) if (r.IsReturn !== 1) m.set(String(r.Order), (m.get(String(r.Order)) ?? 0) + ((r[measure] as number) || 0));
  return [...m.values()];
}

const ALPHA = 0.05;
/** One-sided test in the claimed direction; the opposite direction is checked separately so "rejected" means real counter-evidence. */
function judge(effect: number, r: TestResult, expectPositive: boolean, minEffect: number): Verdict {
  const pFor = expectPositive ? r.pGreater : r.pLess, pAgainst = expectPositive ? r.pLess : r.pGreater;
  if (pFor < ALPHA) return Math.abs(effect) >= minEffect ? 'supported' : 'small-effect';
  if (pAgainst < ALPHA) return 'rejected';
  return 'inconclusive';
}

/** Relative effect for verdicts; from a zero baseline any non-zero difference is treated as material (±Infinity). */
const relEffect = (a: number, b: number) => (b ? (a - b) / Math.abs(b) : a === b ? 0 : Math.sign(a - b) * Infinity);

/** The p-value behind a verdict: the claimed direction, or the opposite direction when the claim was rejected. */
function decisionP(v: Verdict, r: TestResult, expectPositive: boolean) {
  const pFor = expectPositive ? r.pGreater : r.pLess, pAgainst = expectPositive ? r.pLess : r.pGreater;
  return v === 'rejected' ? { p: pAgainst, alternative: `one-sided: ${expectPositive ? 'lower' : 'higher'} than claimed` } : { p: pFor, alternative: `one-sided: ${expectPositive ? 'higher' : 'lower'}, as claimed` };
}

export function testGeneric(ds: Dataset, h: GenericHypothesis, id = 'ai'): HypothesisResult {
  const base = { id, claim: h.claim, source: 'ai' as const, basis: 'tested' as const };
  const cols = new Set(Object.keys(ds.rows[0] ?? {}));
  const bad = [h.measure, ...h.a.filters.map((f) => f.field), ...h.b.filters.map((f) => f.field)].filter((c) => c && !cols.has(c));
  if (bad.length) return { ...base, verdict: 'inconclusive', summary: `Can't test: unknown field(s) ${bad.join(', ')}.`, method: 'none', p: null, stat: null, evidence: {} };
  const A = ds.rows.filter((r) => match(r, h.a.filters)), B = ds.rows.filter((r) => match(r, h.b.filters));
  const vals = (rs: Row[]) => (h.level === 'order' && 'Order' in (rs[0] ?? {}) ? orderTotals(rs, h.measure) : rs.filter((r) => r.IsReturn !== 1).map((r) => (r[h.measure] as number) || 0));
  const va = vals(A), vb = vals(B);
  if (!va.length || !vb.length) return { ...base, verdict: 'inconclusive', summary: `Couldn't test: no orders matched "${!va.length ? h.a.label : h.b.label}".`, method: 'none', p: null, stat: null, evidence: { a: va.length, b: vb.length } };
  const agg = (v: number[]) => (h.metric === 'avg' ? mean(v) : h.metric === 'sum' ? sum(v) : v.length);
  const ga = agg(va), gb = agg(vb), diff = ga - gb;
  // Relative change is undefined from a zero baseline: any non-zero difference from zero counts as material,
  // and the summary reports the absolute difference instead of a percentage.
  const effect: number | null = gb ? diff / Math.abs(gb) : diff === 0 ? 0 : null;
  // From a zero baseline, "material" needs an absolute threshold: the same minimum effect applied to the typical
  // size of this measure across the whole file (and never below one cent / one unit of display precision).
  const typical = (() => { let t = 0, n = 0; for (const r of ds.rows) { const v = r[h.measure]; if (typeof v === 'number' && r.IsReturn !== 1) { t += Math.abs(v); n++; } } return n ? t / n : 0; })();
  const absThreshold = Math.max((h.minEffect ?? 0.05) * (h.metric === 'count' ? 1 : typical * (h.metric === 'sum' ? Math.max(va.length, vb.length) : 1)), h.metric === 'count' ? 1 : 0.01);
  const effectForJudge = effect ?? (Math.abs(diff) >= absThreshold ? Math.sign(diff) * Infinity : 0);
  let r: TestResult;
  if (h.metric === 'avg') r = welchTest(va, vb);
  else if (h.metric === 'sum') r = bootstrapTest(va, vb, sum);
  else {
    // Counts: if events fall into A or B at equal rates, A ~ Binomial(A+B, 0.5). Normal approximation with continuity correction.
    const n = va.length + vb.length, z = (Math.abs(va.length - vb.length) - 1) / Math.sqrt(n) * Math.sign(va.length - vb.length), c = normCdf(z);
    r = { stat: round(z, 3), df: null, p: Math.min(1, 2 * Math.min(c, 1 - c)), pGreater: 1 - c, pLess: c, method: 'Binomial test (normal approximation)' };
  }
  const small = h.metric !== 'count' && (va.length < 20 || vb.length < 20);
  const verdict: Verdict = small ? 'inconclusive' : judge(effectForJudge, r, h.expect === 'a>b', h.minEffect ?? 0.05);
  const isMoney = h.metric !== 'count' && /sales|revenue|amount|profit|price|total|value/i.test(h.measure);
  // Small amounts keep two decimals so a summary never reads "£0 vs £0".
  const $ = (n: number) => (h.metric === 'count' ? Math.round(n).toLocaleString() : Math.abs(n) < 100 && n !== 0 ? (isMoney ? new Intl.NumberFormat('en-US', ds.currency && ds.currency !== 'XXX' ? { style: 'currency', currency: ds.currency, maximumFractionDigits: 4 } : { maximumFractionDigits: 4 }).format(n) : n.toPrecision(3)) : isMoney ? money(n, ds.currency) : (Math.round(n * 10) / 10).toLocaleString());
  const why = small ? ' Too few rows in one group to test (need 20+).' : verdict === 'small-effect' ? (effect === null ? ` Real, but under ${$(absThreshold)}, the smallest difference that would matter for this measure.` : ` Real, but under the ${pctStr(h.minEffect ?? 0.05, 0)} that would matter in practice.`) : '';
  const d = decisionP(verdict, r, h.expect === 'a>b');
  return { ...base, verdict, method: r.method, p: small ? null : round(d.p, 4), pTwoSided: small ? null : round(r.p, 4), alternative: small ? null : d.alternative,
    summary: `${h.a.label}: ${$(ga)} vs ${h.b.label}: ${$(gb)} (${effect === null ? `difference ${diff >= 0 ? '+' : '−'}${$(Math.abs(diff))}, percentage change undefined from zero` : `${effect >= 0 ? '+' : ''}${pctStr(effect)}`}; ${r.method}, ${small ? 'not tested' : `${fmtP(d.p)} ${d.alternative}`}, n = ${va.length} vs ${vb.length}).${why}`,
    stat: { name: r.method, value: r.stat }, evidence: { a: { label: h.a.label, value: round(ga), n: va.length }, b: { label: h.b.label, value: round(gb), n: vb.length }, effect: effect === null ? null : round(effect, 4), absoluteDifference: round(diff, 4), ...(r.df !== null ? { degreesOfFreedom: r.df } : {}), ...('ci' in r ? { differenceCI95: (r as any).ci } : {}) } };
}

/** Built-in library: questions a good analyst would ask of any shop's data. */
export function runHypothesisLibrary(ds: Dataset): HypothesisResult[] {
  const fm = detectFields(ds), rows = ds.rows, $ = (n: number) => money(n, ds.currency), out: HypothesisResult[] = [];
  const tx = rows.length > 0 && 'Order' in rows[0] && 'Customer' in rows[0] && !!fm.date;
  // Every library claim states its direction up front ("X is bigger than Y"), so the decision p-value is one-sided in that direction.
  const lib = (id: string, claim: string, verdict: Verdict, summary: string, test: TestResult | null, evidence: Record<string, unknown>) => {
    const d = test && verdict !== 'inconclusive' ? decisionP(verdict, test, true) : test ? { p: test.pGreater, alternative: 'one-sided: higher, as claimed' } : null;
    const text = test && d ? summary.replace(fmtP(test.p), `${fmtP(d.p)} ${d.alternative}`) : summary;
    out.push({ id, claim, source: 'library', verdict, summary: text, basis: test ? 'tested' : 'descriptive', method: test ? test.method : 'Descriptive check (rule of thumb)', p: d ? round(d.p, 4) : null, pTwoSided: test ? round(test.p, 4) : null, alternative: d?.alternative ?? null, stat: test ? { name: test.method, value: test.stat } : null, evidence });
  };

  if (tx) {
    const sales = rows.filter((r) => r.IsReturn !== 1);
    // Orders with first/repeat flags
    const orders = new Map<string, { c: string; t: number; v: number; country: string; dow: string }>();
    for (const r of sales) { const id = String(r.Order); const o = orders.get(id) ?? { c: String(r.Customer), t: toMs(r[fm.date!]), v: 0, country: String(r.Country ?? ''), dow: bucket(r[fm.date!], 'weekday') }; o.v += (r[fm.measure] as number) || 0; orders.set(id, o); }
    const os = [...orders.values()].filter((o) => !UNKNOWN.has(o.c)).sort((a, b) => a.t - b.t);
    const seen = new Set<string>(), first: number[] = [], repeat: number[] = [];
    for (const o of os) { (seen.has(o.c) ? repeat : first).push(o.v); seen.add(o.c); }
    { const t = welchTest(repeat, first), e = relEffect(mean(repeat), mean(first));
      lib('h-repeat-aov', 'Repeat customers spend more per order than first-time customers', first.length >= 30 && repeat.length >= 30 ? judge(e, t, true, 0.05) : 'inconclusive',
        `Repeat orders average ${$(mean(repeat))} vs first orders ${$(mean(first))} (${e >= 0 ? '+' : ''}${pctStr(e)}; Welch t-test, ${fmtP(t.p)}).`, t, { repeatAvg: round(mean(repeat)), firstAvg: round(mean(first)), repeatOrders: repeat.length, firstOrders: first.length }); }

    // Returns concentrated in few products
    const ret = new Map<string, number>(); let rtot = 0;
    for (const r of rows) if (r.IsReturn === 1) { const v = Math.abs((r[fm.measure] as number) || 0); ret.set(String(r.Product), (ret.get(String(r.Product)) ?? 0) + v); rtot += v; }
    if (ret.size >= 20) {
      const sorted = [...ret.values()].sort((a, b) => b - a), top = Math.ceil(sorted.length * 0.1), share = sum(sorted.slice(0, top)) / rtot;
      lib('h-returns-concentrated', 'A small set of products accounts for most returns', share >= 0.5 ? 'supported' : 'rejected', `The top 10% of returned products (${top}) account for ${pctStr(share)} of returned value (rule of thumb: half or more).`, null, { topProducts: top, share: round(share, 3), returnedProducts: sorted.length });
    }

    // Big orders come from few customers
    const vals = os.map((o) => o.v).sort((a, b) => b - a), cut = vals[Math.max(0, Math.ceil(vals.length * 0.01) - 1)] ?? Infinity;
    const bigCust = new Set(os.filter((o) => o.v >= cut).map((o) => o.c));
    if (vals.length >= 200) lib('h-big-orders-few-customers', 'Your biggest orders come from a small group of customers', bigCust.size <= Math.ceil(vals.length * 0.01) * 0.5 ? 'supported' : 'rejected',
      `The top 1% of orders (${Math.ceil(vals.length * 0.01)}) came from ${bigCust.size} different customers (rule of thumb: at most half as many customers as orders).`, null, { topOrders: Math.ceil(vals.length * 0.01), customers: bigCust.size, threshold: round(cut) });

    // Home vs international basket size
    const countries = new Map<string, number>(); for (const o of os) countries.set(o.country, (countries.get(o.country) ?? 0) + 1);
    const home = [...countries].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (home && countries.size > 1) {
      const h = os.filter((o) => o.country === home).map((o) => o.v), x = os.filter((o) => o.country !== home).map((o) => o.v);
      const t = welchTest(x, h), e = relEffect(mean(x), mean(h));
      lib('h-intl-aov', `International customers place bigger orders than ${home} customers`, x.length >= 30 ? judge(e, t, true, 0.05) : 'inconclusive',
        `Outside ${home}: ${$(mean(x))} per order vs ${$(mean(h))} at home (${e >= 0 ? '+' : ''}${pctStr(e)}; Welch t-test, ${fmtP(t.p)}).`, t, { homeCountry: home, intlAvg: round(mean(x)), homeAvg: round(mean(h)), intlOrders: x.length, homeOrders: h.length });
    }

    // Growth from new vs existing customers
    const days = pickWindowDays(sales, fm.date!), w = comparisonWindows(sales, fm.date!, days);
    if (w) {
      const firstSeen = new Map<string, number>(); for (const o of os) if (!firstSeen.has(o.c)) firstSeen.set(o.c, o.t);
      const split = (win: [number, number]) => { let n = 0, e = 0; for (const o of os) if (inWin(o.t, win)) (firstSeen.get(o.c)! >= win[0] ? (n += o.v) : (e += o.v)); return { n, e }; };
      const B = split(w.baseline), C = split(w.current), dn = C.n - B.n, de = C.e - B.e;
      lib('h-growth-source', 'Growth is coming from new customers rather than existing ones', Math.abs(dn) + Math.abs(de) === 0 ? 'inconclusive' : dn > de ? 'supported' : 'rejected',
        `${w.label}: new-customer revenue ${dn >= 0 ? '+' : ''}${$(dn)}, existing-customer revenue ${de >= 0 ? '+' : ''}${$(de)} (comparison of the two changes).`, null, { window: w.label, newDelta: round(dn), existingDelta: round(de) });
    }

    // Weekday pattern
    const byDow = new Map<string, number[]>(); for (const o of os) byDow.set(o.dow, [...(byDow.get(o.dow) ?? []), o.v]);
    const wkend = [...(byDow.get('Sat') ?? []), ...(byDow.get('Sun') ?? [])], wkday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].flatMap((d) => byDow.get(d) ?? []);
    if (wkend.length >= 30) { const t = welchTest(wkend, wkday), e = relEffect(mean(wkend), mean(wkday));
      lib('h-weekend', 'Weekend orders are bigger than weekday orders', judge(e, t, true, 0.05), `Weekend ${$(mean(wkend))} vs weekday ${$(mean(wkday))} per order (Welch t-test, ${fmtP(t.p)}).`, t, { weekendAvg: round(mean(wkend)), weekdayAvg: round(mean(wkday)), weekendOrders: wkend.length }); }
    else lib('h-weekend', 'Weekend orders are bigger than weekday orders', 'inconclusive', `Only ${wkend.length} weekend orders exist${(byDow.get('Sat') ?? []).length === 0 ? ' (no Saturday orders at all)' : ''}, too few to compare.`, null, { weekendOrders: wkend.length, saturdayOrders: (byDow.get('Sat') ?? []).length });
  }

  // Discount hypotheses (datasets with discount + profit)
  if (fm.discount && fm.profit) {
    const pts = rows.filter((r) => typeof r[fm.discount!] === 'number' && typeof r.Quantity === 'number');
    const r = pearson(pts.map((p) => p[fm.discount!] as number), pts.map((p) => p.Quantity as number)), n = pts.length;
    // Significance of a correlation: t = r·√(n−2)/√(1−r²) with n−2 degrees of freedom.
    const test = corrTest(r, n);
    lib('h-discount-volume', 'Orders with bigger discounts include more units', judge(r, test, true, 0.1),
      `Correlation between discount and units per order: r = ${r.toFixed(2)} across ${n} orders (${fmtP(test.p)}). This shows association, not cause.`, test, { pearson: round(r, 3), orders: n });
  }
  return out;
}
