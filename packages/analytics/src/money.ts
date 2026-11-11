/** Currency-aware formatting shared by findings, reports and the analyst. */
/** ISO 4217 code for "no currency": used when a file doesn't say what currency it's in. */
export const NO_CURRENCY = 'XXX';
export function money(n: number | null | undefined, currency = 'USD', compact = false) {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  if (currency === NO_CURRENCY) return new Intl.NumberFormat('en-US', { maximumFractionDigits: compact ? 1 : 0, ...(compact ? { notation: 'compact' } : {}) }).format(n);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: compact ? 1 : 0, ...(compact ? { notation: 'compact' } : {}) }).format(n);
}
export const pctStr = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
export function plural(dim: string) {
  const s = dim.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.endsWith('y') && !/[aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : s.endsWith('s') ? s : s + 's';
}

/**
 * Re-express every amount written in `from` (exactly as money() formats it, e.g. "£114,284" or "£1.1K")
 * in `to` at `rate`. Analysis runs once in the data's own currency; only the text shown is converted.
 */
export function convertMoneyText(text: string, from: string, to: string, rate: number) {
  if (from === NO_CURRENCY) return text;
  const sym = new Intl.NumberFormat('en-US', { style: 'currency', currency: from }).formatToParts(1).find((p) => p.type === 'currency')?.value;
  if (!sym) return text;
  const esc = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(-?)${esc}\\s?(\\d+(?:,\\d{3})*(?:\\.\\d+)?)([KMBT])?(?![\\w])`, 'g');
  const mult: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return text.replace(re, (_m, neg: string, num: string, suf?: string) => {
    const n = Number(num.replace(/,/g, '')) * (suf ? mult[suf] : 1) * rate * (neg ? -1 : 1);
    return money(n, to, !!suf);
  });
}

/** Deep-convert every string in a JSON-able value (used on API responses). */
export function convertMoneyDeep<T>(v: T, from: string, to: string, rate: number): T {
  if (typeof v === 'string') return convertMoneyText(v, from, to, rate) as T;
  if (Array.isArray(v)) return v.map((x) => convertMoneyDeep(x, from, to, rate)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convertMoneyDeep(x, from, to, rate)])) as T;
  return v;
}
