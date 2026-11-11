export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export const median = (a: number[]) => quantile([...a].sort((x, y) => x - y), 0.5);
export function std(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}
export function iqrBounds(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
  return { q1, q3, low: q1 - 1.5 * iqr, high: q3 + 1.5 * iqr };
}
export function pearson(x: number[], y: number[]) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
export const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
