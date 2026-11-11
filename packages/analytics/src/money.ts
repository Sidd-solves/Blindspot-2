/** A display conversion: amounts stored in `from` are shown in `to` at `rate`. */
export interface Fx { from: string; to: string; rate: number }
let resolveFx: () => Fx | undefined = () => undefined;
/** The server plugs in a per-request lookup, so each visitor can pick their own display currency. */
export const setFxResolver = (f: () => Fx | undefined) => { resolveFx = f; };
/** Cache-key suffix: results that contain formatted money depend on the display currency. */
export const fxKey = () => { const f = resolveFx(); return f ? `${f.to}@${f.rate}` : ''; };

/** Currency-aware formatting shared by findings, reports and the analyst. */
export function money(n: number | null | undefined, currency = 'USD', compact = false) {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  const fx = resolveFx();
  if (fx && fx.from === currency && fx.to !== currency) { n *= fx.rate; currency = fx.to; }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: compact ? 1 : 0, ...(compact ? { notation: 'compact' } : {}) }).format(n);
}
export const pctStr = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
export function plural(dim: string) {
  const s = dim.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.endsWith('y') && !/[aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : s.endsWith('s') ? s : s + 's';
}
