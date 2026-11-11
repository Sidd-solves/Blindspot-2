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

// ---------------------------------------------------------------- real significance tests
/** ln Γ(x), Lanczos approximation. */
function lgamma(x: number): number {
  const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1; let a = 0.9999999999998099;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += c[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
/** Continued fraction for the incomplete beta function (Numerical Recipes). */
function betacf(a: number, b: number, x: number) {
  const MAX = 300, EPS = 3e-14, FPMIN = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1); if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
  for (let m = 1; m <= MAX; m++) {
    const m2 = 2 * m; let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
/** Regularized incomplete beta I_x(a, b). */
export function ibeta(x: number, a: number, b: number) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** P(T ≤ t) for Student's t with `df` degrees of freedom. */
export function tCdf(t: number, df: number) {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const ib = ibeta(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}
/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normCdf(z: number) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const s = Math.sign(z), x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + s * erf);
}

/** stat is null when no statistic exists (e.g. zero variance: the difference is exact). */
/** Rounds a test statistic, keeping null (no statistic) as null. */
export const roundStat = (x: number | null, d = 2) => (x == null ? null : round(x, d));

export interface TestResult { stat: number | null; df: number | null; p: number; pGreater: number; pLess: number; method: string }

/** Welch's unequal-variance t-test with Welch–Satterthwaite degrees of freedom. Zero variance is handled explicitly. */
export function welchTest(a: number[], b: number[]): TestResult {
  const method = 'Welch t-test';
  if (a.length < 2 || b.length < 2) return { stat: 0, df: null, p: 1, pGreater: 0.5, pLess: 0.5, method };
  const va = std(a) ** 2 / a.length, vb = std(b) ** 2 / b.length, diff = mean(a) - mean(b), se = Math.sqrt(va + vb);
  if (se === 0) {
    // No variation inside either group: any difference in means is exact, not noise.
    if (diff === 0) return { stat: 0, df: null, p: 1, pGreater: 0.5, pLess: 0.5, method: `${method} (no variation)` };
    return { stat: null, df: null, p: 0, pGreater: diff > 0 ? 0 : 1, pLess: diff > 0 ? 1 : 0, method: `${method} (no variation: difference is exact)` };
  }
  const t = diff / se;
  const df = (va + vb) ** 2 / ((va ** 2) / (a.length - 1) + (vb ** 2) / (b.length - 1));
  const cdf = tCdf(t, df);
  return { stat: round(t, 3), df: round(df, 1), p: Math.min(1, 2 * Math.min(cdf, 1 - cdf)), pGreater: 1 - cdf, pLess: cdf, method };
}

/** Two-proportion z-test (x1/n1 vs x2/n2), pooled standard error. */
export function propTest(x1: number, n1: number, x2: number, n2: number): TestResult {
  const method = 'Two-proportion z-test';
  if (!n1 || !n2) return { stat: 0, df: null, p: 1, pGreater: 0.5, pLess: 0.5, method };
  const p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return { stat: 0, df: null, p: 1, pGreater: 0.5, pLess: 0.5, method };
  const z = (x1 / n1 - x2 / n2) / se, c = normCdf(z);
  return { stat: round(z, 3), df: null, p: Math.min(1, 2 * Math.min(c, 1 - c)), pGreater: 1 - c, pLess: c, method };
}

/** Deterministic PRNG so bootstrap results are reproducible. */
function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Bootstrap test for a difference in a statistic (e.g. group totals): resample each group with replacement,
 * recompute the difference, and read the p-value and 95% interval from the resampled distribution.
 */
export function bootstrapTest(a: number[], b: number[], stat: (x: number[]) => number, iters = 2000, seed = 17): TestResult & { ci: [number, number] } {
  const rnd = mulberry(seed), obs = stat(a) - stat(b), diffs = new Array<number>(iters);
  const pick = (x: number[]) => { const o = new Array<number>(x.length); for (let i = 0; i < x.length; i++) o[i] = x[Math.floor(rnd() * x.length)]; return o; };
  for (let i = 0; i < iters; i++) diffs[i] = stat(pick(a)) - stat(pick(b));
  diffs.sort((x, y) => x - y);
  const le0 = diffs.filter((d) => d <= 0).length / iters, ge0 = diffs.filter((d) => d >= 0).length / iters;
  return { stat: round(obs, 2), df: null, p: Math.min(1, 2 * Math.min(le0, ge0)), pGreater: le0, pLess: ge0, method: `Bootstrap (${iters} resamples)`, ci: [round(quantile(diffs, 0.025), 2), round(quantile(diffs, 0.975), 2)] };
}

/** Benjamini–Hochberg false-discovery-rate adjustment (q-values), for scans that test many segments at once. */
export function bhAdjust(ps: number[]): number[] {
  const n = ps.length, idx = ps.map((p, i) => [p, i] as const).sort((x, y) => x[0] - y[0]), q = new Array<number>(n);
  let min = 1;
  for (let k = n - 1; k >= 0; k--) { const [p, i] = idx[k]; min = Math.min(min, (p * n) / (k + 1)); q[i] = Math.min(1, min); }
  return q;
}

/** Plain-language p-value: "p = 0.003", "p < 0.001". */
export const fmtP = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${p < 0.01 ? p.toFixed(3) : p.toFixed(2)}`);

/**
 * Significance of a Pearson correlation: t = r·√(n−2)/√(1−r²), n−2 degrees of freedom.
 * |r| = 1 (every point on a line) has no finite t: the direction is certain, so p is 0 or 1 by side.
 */
export function corrTest(r: number, n: number): TestResult {
  const method = 'Correlation t-test';
  if (n < 3 || !Number.isFinite(r)) return { stat: null, df: null, p: 1, pGreater: 0.5, pLess: 0.5, method: `${method} (too few points)` };
  if (Math.abs(r) >= 1) return { stat: null, df: n - 2, p: 0, pGreater: r > 0 ? 0 : 1, pLess: r > 0 ? 1 : 0, method: `${method} (perfect correlation: no finite statistic)` };
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r), c = tCdf(t, n - 2);
  return { stat: round(t, 3), df: n - 2, p: Math.min(1, 2 * Math.min(c, 1 - c)), pGreater: 1 - c, pLess: c, method };
}
