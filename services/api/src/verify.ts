/**
 * Fact-checks the numbers in an AI answer against the numbers the analysis tools actually returned.
 *
 * Every figure the model writes ("£93,531", "42%", "1.8×", "3.2K orders") is parsed and matched against the
 * evidence at the precision it was written in: "£93.5K" matches 93,531.25, "42%" matches 0.4183, but "£95,000" does
 * not match anything. A figure that equals the sum, difference or ratio of two evidence numbers counts as derived.
 * Everything else is unverified. Small bare integers (list counts, "2-4 bullets"), years and dates are skipped.
 */

export type ClaimStatus = 'verified' | 'derived' | 'unverified';
export interface Claim {
  text: string;
  start: number;
  end: number;
  value: number;
  status: ClaimStatus;
  /** The tool whose output the figure came from. */
  source: string | null;
}
export interface FactCheck {
  claims: Claim[];
  checked: number;
  verified: number;
  derived: number;
  unverified: number;
}

const MAX_NUMBERS = 25_000,
  MAX_PAIRS = 300;

/** All numbers in a tool result, with the tool that produced them. Strings like "£1,234" count too. */
export function evidenceNumbers(evidence: { tool: string; data?: unknown }[]) {
  const out: { v: number; tool: string }[] = [];
  const walk = (x: unknown, tool: string, depth: number) => {
    if (out.length >= MAX_NUMBERS || depth > 12 || x == null) return;
    if (typeof x === 'number') {
      if (Number.isFinite(x)) out.push({ v: x, tool });
    } else if (typeof x === 'string') {
      if (x.length < 400) for (const c of parseClaims(x)) out.push({ v: c.value, tool });
    } else if (Array.isArray(x)) {
      out.push({ v: x.length, tool }); // "10 customers" is the length of a list
      for (const y of x) walk(y, tool, depth + 1);
    } else if (typeof x === 'object') for (const y of Object.values(x as object)) walk(y, tool, depth + 1);
  };
  for (const e of evidence) walk(e.data, e.tool, 0);
  return out;
}

// A number as written: optional currency, digits with thousands separators, decimals, optional K/M/B, %, ×.
const NUM =
  /(?<![\w.])(?:(?<cur>[£$€¥])\s?)?(?<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(?<suf>[kKmMbB](?![a-zA-Z])|million|billion|thousand)?\s?(?<unit>%|×|x(?![a-zA-Z])|pp\b|percentage points)?/g;

interface Parsed {
  text: string;
  start: number;
  end: number;
  value: number;
  /** Half of the smallest unit shown: the rounding the writer could have applied. */
  tol: number;
  pct: boolean;
}

export function parseClaims(text: string): Parsed[] {
  const out: Parsed[] = [];
  for (const m of text.matchAll(NUM)) {
    const g = m.groups!;
    const raw = g.num.replace(/,/g, '');
    let value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    const suf = (g.suf ?? '').toLowerCase();
    const scale =
      suf === 'k' || suf === 'thousand'
        ? 1e3
        : suf === 'm' || suf === 'million'
          ? 1e6
          : suf === 'b' || suf === 'billion'
            ? 1e9
            : 1;
    value *= scale;
    const pct = g.unit === '%' || g.unit === 'pp' || g.unit === 'percentage points';
    const end = m.index! + m[0].trimEnd().length;
    const before = text.slice(Math.max(0, m.index! - 1), m.index!);
    const after = text.slice(end, end + 1);
    // Dates, times, years and identifiers aren't claims.
    if (/[-/:]/.test(before) || /[-/:]\d/.test(text.slice(end, end + 2))) continue;
    if (!g.cur && !pct && !suf && !g.unit && /^(19|20)\d\d$/.test(raw)) continue;
    if (!g.cur && !pct && !suf && !g.unit && value < 10 && decimals === 0) continue;
    if (/[A-Za-z]/.test(after) && !g.unit && !suf && !/\s/.test(after)) continue; // e.g. "Q4", "3rd"
    out.push({
      text: m[0].trimEnd(),
      start: m.index!,
      end,
      value,
      tol: (0.5 * scale) / 10 ** decimals,
      pct,
    });
  }
  return out;
}

/** Ways a stored number can be shown: as is, as a percentage of a share, and unsigned. */
const views = (n: number, pct: boolean) => {
  const v = [n, Math.abs(n)];
  if (pct) v.push(n * 100, Math.abs(n * 100));
  return v;
};

export function factCheck(answer: string, evidence: { tool: string; data?: unknown }[]): FactCheck {
  const nums = evidenceNumbers(evidence);
  const claims: Claim[] = [];
  // For derived checks, the distinct larger numbers only (keeps the pair search small).
  const distinct = [...new Map(nums.filter((n) => Math.abs(n.v) >= 1).map((n) => [n.v, n])).values()]
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, MAX_PAIRS);
  for (const c of parseClaims(answer)) {
    const near = (x: number) => Math.abs(x - c.value) <= c.tol + 1e-9 * Math.abs(c.value);
    let status: ClaimStatus = 'unverified',
      source: string | null = null;
    const hit = nums.find((n) => views(n.v, c.pct).some(near));
    if (hit) {
      status = 'verified';
      source = hit.tool;
    } else {
      outer: for (let i = 0; i < distinct.length; i++)
        for (let j = 0; j < distinct.length; j++) {
          if (i === j) continue;
          const a = distinct[i].v,
            b = distinct[j].v;
          const cands = [a + b, a - b, b ? a / b : NaN, b ? (a - b) / b : NaN];
          if (cands.some((x) => Number.isFinite(x) && views(x, c.pct).some(near))) {
            status = 'derived';
            source = distinct[i].tool;
            break outer;
          }
        }
    }
    claims.push({ text: c.text, start: c.start, end: c.end, value: c.value, status, source });
  }
  const count = (s: ClaimStatus) => claims.filter((c) => c.status === s).length;
  return {
    claims,
    checked: claims.length,
    verified: count('verified'),
    derived: count('derived'),
    unverified: count('unverified'),
  };
}
