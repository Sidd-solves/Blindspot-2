/** Currency-aware formatting shared by findings, reports and the analyst. */
export function money(n: number | null | undefined, currency = 'USD', compact = false) {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: compact ? 1 : 0, ...(compact ? { notation: 'compact' } : {}) }).format(n);
}
export const pctStr = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
export function plural(dim: string) {
  const s = dim.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.endsWith('y') && !/[aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : s.endsWith('s') ? s : s + 's';
}
