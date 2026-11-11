/**
 * Customer radar: who is slipping away now (early warning) and who already went quiet (win-back list).
 *
 * Early warning flags repeat customers who have been silent 45–90 days: past the point where most regulars have
 * reordered, but before the 90-day line where they count as lost (they then move to the win-back list). The rule is
 * replayed in the past: flag customers as of 90 days before the data ends, using only orders before that date, then
 * check who really came back, and test that against everyone who wasn't flagged.
 *
 * Why plain silence and not "late for their own rhythm": on the real UK shop, rules based on each customer's usual
 * gap between orders did not predict leaving on either test date (flagged customers came back as often as the
 * rest), while 45+ days of silence did, on a tuning date and again on a later validation date. The rule here is the
 * one that held up on data it wasn't tuned on.
 *
 * The win-back list uses exactly the same definition as the "best customers who stopped ordering" finding, so the
 * list and the finding always agree.
 */
import type { Dataset, Row } from './types';
import { detectFields } from './profile';
import { propTest } from './stats';
import { DAY, dateSpan, toMs } from './time';

/** Same as the store checks, so the win-back list and the lapsed-customer finding agree exactly. */
const UNKNOWN = new Set(['Unknown customer', 'Guest checkout', '']);
const round2 = (n: number) => Math.round(n * 100) / 100;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

interface Order {
  id: string;
  t: number;
  customer: string;
  total: number;
  products: string[];
}

/** The day after the last date in the data (any row), the same "end" the store checks use. */
function endOf(ds: Dataset): number {
  const fm = detectFields(ds);
  return fm.date ? dateSpan(ds.rows, fm.date).max + DAY : 0;
}

/** Sale orders (returns excluded) with their customer, date, total and products. */
function ordersOf(ds: Dataset): Order[] {
  const fm = detectFields(ds);
  if (!fm.date) return [];
  const product = ['Product', 'Description', 'Item', 'Title'].find((c) => ds.rows[0] && c in ds.rows[0]);
  const map = new Map<string, Order>();
  for (const r of ds.rows as Row[]) {
    if (r.IsReturn === 1) continue;
    const customer = String(r.Customer ?? '');
    if (UNKNOWN.has(customer)) continue;
    const id = String(r.Order ?? `${customer}|${r[fm.date]}`);
    let o = map.get(id);
    if (!o) {
      o = { id, t: toMs(r[fm.date]), customer, total: 0, products: [] };
      map.set(id, o);
    }
    o.total += (r[fm.measure] as number) || 0;
    if (product && r[product]) o.products.push(String(r[product]));
  }
  return [...map.values()].filter((o) => Number.isFinite(o.t)).sort((a, b) => a.t - b.t);
}

interface History {
  days: number[]; // distinct order days, ascending
  orders: Order[];
}
function histories(orders: Order[], before: number): Map<string, History> {
  const by = new Map<string, History>();
  for (const o of orders) {
    if (o.t >= before) continue;
    const h = by.get(o.customer) ?? { days: [], orders: [] };
    const d = Math.floor(o.t / DAY);
    if (h.days[h.days.length - 1] !== d) h.days.push(d);
    h.orders.push(o);
    by.set(o.customer, h);
  }
  return by;
}

export const RULE = {
  minOrders: 2,
  minSilentDays: 45,
  maxSilentDays: 90,
  testWindowDays: 90,
};

/** Customers late for their usual reorder at `asOf`, judged only from orders before `asOf`. */
function lateAt(orders: Order[], asOf: number) {
  const out: {
    customer: string;
    orders: number;
    typicalGap: number;
    silent: number;
    last: number;
    yearSpend: number;
    eligible: boolean;
  }[] = [];
  for (const [customer, h] of histories(orders, asOf)) {
    if (h.days.length < RULE.minOrders) continue;
    const gaps = h.days.slice(1).map((d, i) => d - h.days[i]);
    const typicalGap = median(gaps);
    const last = h.orders[h.orders.length - 1].t;
    // Days from their last order to the last day before `asOf` (the last day of data, for "now").
    const silent = Math.floor((asOf - DAY - last) / DAY);
    // Only customers still "active" can be early-warned; long-silent ones are win-back territory.
    const eligible = silent <= RULE.maxSilentDays;
    const yearSpend = h.orders.filter((o) => o.t >= asOf - 365 * DAY).reduce((s, o) => s + o.total, 0);
    out.push({ customer, orders: h.days.length, typicalGap, silent, last, yearSpend, eligible });
  }
  const isLate = (c: (typeof out)[number]) => c.eligible && c.silent >= RULE.minSilentDays;
  return { all: out.filter((c) => c.eligible), late: out.filter(isLate), everyone: out };
}

export interface EarlyWarning {
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
    /** One-sided: flagged customers stayed away more often than the others. */
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
  valueAtRisk: number;
  /** Every repeat customer's days since last order (up to 180) and last-year spend, for the rhythm chart. */
  spread: { silentDays: number; yearSpend: number; zone: 'active' | 'slipping' | 'lost' }[];
}

export function earlyWarning(ds: Dataset): EarlyWarning {
  const orders = ordersOf(ds);
  const rule = `A repeat customer (${RULE.minOrders}+ order days) with no order for ${RULE.minSilentDays}–${RULE.maxSilentDays} days: past when most regulars reorder, before they count as lost.`;
  const end = endOf(ds);
  const empty = (reason: string): EarlyWarning => ({
    ok: false,
    reason,
    asOf: end ? isoDay(end - DAY) : '',
    rule,
    backtest: null,
    customers: [],
    valueAtRisk: 0,
    spread: [],
  });
  if (!orders.length)
    return empty('Needs dates and customer IDs on sales to spot customers who are slipping away.');
  const span = (end - orders[0].t) / DAY;
  if (span < 180)
    return empty(
      `Needs about 6 months of orders to learn each customer's rhythm; this data covers ${Math.round(span)} days.`,
    );

  // Replay the rule 90 days before the end, using only earlier orders, and see who really came back.
  const t0 = end - RULE.testWindowDays * DAY;
  const past = lateAt(orders, t0);
  const cameBack = new Set(orders.filter((o) => o.t >= t0 && o.t < end).map((o) => o.customer));
  const flaggedSet = new Set(past.late.map((c) => c.customer));
  const others = past.all.filter((c) => !flaggedSet.has(c.customer));
  const fAway = past.late.filter((c) => !cameBack.has(c.customer)).length,
    oAway = others.filter((c) => !cameBack.has(c.customer)).length;
  const test =
    past.late.length && others.length ? propTest(fAway, past.late.length, oAway, others.length) : null;

  const now = lateAt(orders, end);
  const customers = now.late
    .sort((a, b) => b.yearSpend - a.yearSpend)
    .map((c) => ({
      customer: c.customer,
      orders: c.orders,
      typicalGapDays: Math.round(c.typicalGap),
      silentDays: c.silent,
      lateBy: Math.round(c.silent - c.typicalGap),
      lastOrder: isoDay(c.last),
      expectedBy: isoDay(c.last + c.typicalGap * DAY),
      yearSpend: round2(c.yearSpend),
    }));
  return {
    ok: true,
    asOf: isoDay(end - DAY),
    rule,
    backtest: {
      asOf: isoDay(t0),
      windowDays: RULE.testWindowDays,
      flagged: past.late.length,
      flaggedStayedAway: fAway,
      others: others.length,
      othersStayedAway: oAway,
      p: test ? Math.round(test.pGreater * 10000) / 10000 : null,
      method: test ? `${test.method} (one-sided)` : 'Not enough customers to test',
    },
    customers,
    valueAtRisk: round2(customers.reduce((s, c) => s + c.yearSpend, 0)),
    spread: now.everyone
      .filter((c) => c.silent <= 180)
      .sort((a, b) => b.yearSpend - a.yearSpend)
      .slice(0, 800)
      .map((c) => ({
        silentDays: c.silent,
        yearSpend: round2(c.yearSpend),
        zone: c.silent > RULE.maxSilentDays ? 'lost' : c.silent >= RULE.minSilentDays ? 'slipping' : 'active',
      })),
  };
}

export interface WinBack {
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
}

/**
 * The best customers who went quiet, ready to contact: same definition as the finding (top 10% by spend in the year
 * before the last 90 days, 3+ orders in that year, no order in the last 90 days), plus what they used to buy and a
 * plain draft message. Nothing is sent from here.
 */
export function winBackList(ds: Dataset, shopName = 'our shop'): WinBack {
  const orders = ordersOf(ds);
  if (!orders.length)
    return {
      ok: false,
      reason: 'Needs dates and customer IDs on sales.',
      cutoff: '',
      customers: [],
      total: 0,
    };
  const end = endOf(ds);
  const cutoff = end - 90 * DAY,
    yearStart = cutoff - 365 * DAY;
  if (cutoff - orders[0].t < 60 * DAY)
    return {
      ok: false,
      reason: 'Needs at least 5 months of history (2 before the last 90 days).',
      cutoff: isoDay(cutoff),
      customers: [],
      total: 0,
    };
  const prior = new Map<string, { rev: number; n: number; last: number; products: Map<string, number> }>();
  for (const o of orders) {
    const e = prior.get(o.customer) ?? { rev: 0, n: 0, last: 0, products: new Map() };
    if (o.t >= yearStart && o.t < cutoff) {
      e.rev += o.total;
      e.n++;
      for (const p of o.products) e.products.set(p, (e.products.get(p) ?? 0) + 1);
    }
    e.last = Math.max(e.last, o.t);
    prior.set(o.customer, e);
  }
  const ranked = [...prior].filter(([, e]) => e.rev > 0).sort((a, b) => b[1].rev - a[1].rev);
  const best = ranked.slice(0, Math.max(10, Math.ceil(ranked.length * 0.1)));
  const lapsed = best.filter(([, e]) => e.n >= 3 && e.last < cutoff);
  const customers = lapsed.map(([c, e]) => {
    const topProducts = [...e.products.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([p]) => p);
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? c : null;
    const fav = topProducts[0] ? topProducts[0].toLowerCase() : 'your usual order';
    return {
      customer: c,
      email,
      orders: e.n,
      spend: round2(e.rev),
      lastOrder: isoDay(e.last),
      daysSilent: Math.floor((end - DAY - e.last) / DAY),
      topProducts,
      message:
        `Hi there,\n\nWe noticed it's been a while since your last order with ${shopName}, and we wanted to say thank you ` +
        `for being one of our best customers. If anything about your last order wasn't right, just reply and tell us.\n\n` +
        `Your ${fav} is still here whenever you need it.\n\nThank you,\n${shopName}`,
    };
  });
  return {
    ok: true,
    cutoff: isoDay(cutoff),
    customers,
    total: round2(customers.reduce((s, c) => s + c.spend, 0)),
  };
}
