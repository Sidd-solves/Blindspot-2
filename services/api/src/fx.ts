import { AsyncLocalStorage } from 'node:async_hooks';
import { setFxResolver, type Fx } from '@blindspot/analytics';

/** Currencies the ECB publishes daily rates for (served free by frankfurter.dev). */
export const CURRENCIES: Record<string, string> = {
  USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', INR: 'Indian rupee', CAD: 'Canadian dollar', AUD: 'Australian dollar',
  JPY: 'Japanese yen', CNY: 'Chinese yuan', CHF: 'Swiss franc', SEK: 'Swedish krona', NOK: 'Norwegian krone', DKK: 'Danish krone',
  NZD: 'New Zealand dollar', SGD: 'Singapore dollar', HKD: 'Hong Kong dollar', KRW: 'South Korean won', MXN: 'Mexican peso',
  BRL: 'Brazilian real', ZAR: 'South African rand', TRY: 'Turkish lira', PLN: 'Polish zloty', CZK: 'Czech koruna', HUF: 'Hungarian forint',
  ILS: 'Israeli shekel', IDR: 'Indonesian rupiah', MYR: 'Malaysian ringgit', PHP: 'Philippine peso', THB: 'Thai baht', RON: 'Romanian leu', ISK: 'Icelandic krona',
};

// Approximate USD rates, used only when the live feed can't be reached (the UI then says "approximate").
const FALLBACK_PER_USD: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.78, INR: 84, CAD: 1.38, AUD: 1.52, JPY: 150, CNY: 7.2, CHF: 0.88, SEK: 10.6, NOK: 10.9, DKK: 6.9,
  NZD: 1.67, SGD: 1.34, HKD: 7.8, KRW: 1380, MXN: 19.5, BRL: 5.6, ZAR: 18.2, TRY: 34, PLN: 4, CZK: 23.4, HUF: 365,
  ILS: 3.7, IDR: 15800, MYR: 4.4, PHP: 57, THB: 34, RON: 4.6, ISK: 138,
};

export interface RateTable { base: string; date: string; live: boolean; rates: Record<string, number> }
const cache = new Map<string, { at: number; table: RateTable }>();
const TTL = 12 * 3600_000;

function fallback(base: string): RateTable {
  const b = FALLBACK_PER_USD[base] ?? 1;
  return { base, date: '', live: false, rates: Object.fromEntries(Object.entries(FALLBACK_PER_USD).map(([k, v]) => [k, v / b])) };
}

/** Today's rates from `base` to every supported currency (cached 12h, never throws). */
export async function ratesFor(base: string): Promise<RateTable> {
  const hit = cache.get(base);
  if (hit && Date.now() - hit.at < TTL) return hit.table;
  let table: RateTable;
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { date: string; rates: Record<string, number> };
    table = { base, date: j.date, live: true, rates: { ...Object.fromEntries(Object.entries(j.rates).filter(([k]) => k in CURRENCIES)), [base]: 1 } };
  } catch {
    table = hit?.table ?? fallback(base);
  }
  cache.set(base, { at: Date.now(), table });
  return table;
}

const als = new AsyncLocalStorage<Fx>();
setFxResolver(() => als.getStore());

/** Run `fn` with money shown in `to` (no-op when `to` is missing, unknown or the same as the data's currency). */
export async function withDisplayCurrency<T>(from: string, to: unknown, fn: () => T): Promise<T> {
  if (typeof to !== 'string' || !(to in CURRENCIES) || to === from || !(from in CURRENCIES)) return fn();
  const rate = (await ratesFor(from)).rates[to];
  return rate ? als.run({ from, to, rate }, fn) : fn();
}
