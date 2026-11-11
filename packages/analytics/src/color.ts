export type RGB = [number, number, number];
export const hexToRgb = (h: string): RGB => {
  const s = h.replace('#', '');
  const f =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
export const rgbToHex = (c: RGB) =>
  '#' +
  c
    .map((x) =>
      Math.max(0, Math.min(255, Math.round(x)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const lin = (v: number) => {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
export const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrastRatio(a: string, b: string) {
  const la = luminance(hexToRgb(a)),
    lb = luminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// Machado et al. 2009 severity-1.0 matrices (linear RGB approximation applied to sRGB values)
const CVD: Record<string, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
export function simulateCvd(c: RGB, kind: keyof typeof CVD): RGB {
  const m = CVD[kind];
  return [0, 1, 2].map((i) => m[i][0] * c[0] + m[i][1] * c[1] + m[i][2] * c[2]) as RGB;
}
/** Heuristic: RGB distance (0-441) below which two simulated colors read as the same. */
export const CVD_MIN_DISTANCE = 60;
const dist = (a: RGB, b: RGB) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

export function analyzeColors(colors: string[], background = '#ffffff') {
  const issues: { severity: 'high' | 'medium' | 'low'; message: string }[] = [];
  const contrast = colors.map((c) => ({
    color: c,
    ratio: Math.round(contrastRatio(c, background) * 100) / 100,
  }));
  for (const c of contrast)
    if (c.ratio < 3)
      issues.push({
        severity: 'medium',
        message: `${c.color} has contrast ${c.ratio}:1 on the background (WCAG graphics need 3:1).`,
      });
  const cvdClashes: { kind: string; a: string; b: string; distance: number }[] = [];
  for (const kind of Object.keys(CVD) as (keyof typeof CVD)[]) {
    for (let i = 0; i < colors.length; i++)
      for (let j = i + 1; j < colors.length; j++) {
        const d = dist(simulateCvd(hexToRgb(colors[i]), kind), simulateCvd(hexToRgb(colors[j]), kind));
        if (d < CVD_MIN_DISTANCE)
          cvdClashes.push({ kind, a: colors[i], b: colors[j], distance: Math.round(d) });
      }
  }
  const common = cvdClashes.filter((c) => c.kind !== 'tritanopia');
  if (common.length)
    issues.push({
      severity: 'high',
      message: `${common.length} color pair(s) become hard to tell apart for red-green colorblind viewers (about 8% of men).`,
    });
  if (cvdClashes.length > common.length)
    issues.push({
      severity: 'low',
      message: `${cvdClashes.length - common.length} pair(s) are close under tritanopia (very rare).`,
    });
  if (colors.length > 8)
    issues.push({
      severity: 'medium',
      message: `${colors.length} categorical colors exceed what viewers can reliably distinguish (about 8).`,
    });
  return {
    contrast,
    cvdClashes: cvdClashes.slice(0, 10),
    issues,
    passes: !issues.some((i) => i.severity !== 'low'),
  };
}

const POOL = [
  '#0072B2',
  '#D55E00',
  '#009E73',
  '#CC79A7',
  '#1F2937',
  '#B8860B',
  '#7B3FA0',
  '#7C2D12',
  '#4D7C0F',
  '#1E3A8A',
  '#A21CAF',
  '#0F766E',
  '#C0392B',
  '#6B7280',
  '#E11D74',
  '#0369A1',
  '#9A3412',
  '#5B21B6',
  '#2E7D32',
  '#8E5A2B',
];
/** Greedy pick: each color must meet 3:1 contrast on the background and stay distinct from those already chosen. `minDist` is applied in normal vision and under protan/deutan. */
function pickCategorical(count: number, background: string, minDist: number, seed: string[] = []) {
  const chosen = [...seed];
  for (const c of POOL) {
    if (chosen.length >= count) break;
    if (chosen.includes(c) || contrastRatio(c, background) < 3) continue;
    const ok = chosen.every(
      (o) =>
        (['protanopia', 'deuteranopia'] as const).every(
          (k) => dist(simulateCvd(hexToRgb(c), k), simulateCvd(hexToRgb(o), k)) >= minDist,
        ) && dist(hexToRgb(c), hexToRgb(o)) >= minDist,
    );
    if (ok) chosen.push(c);
  }
  return chosen;
}
export function generatePalette(
  count: number,
  kind: 'categorical' | 'sequential' | 'diverging',
  name = 'Blindspot',
  background = '#ffffff',
) {
  let colors: string[];
  let safeCount = count;
  if (kind === 'categorical') {
    const strict = pickCategorical(Math.min(count, 8), background, CVD_MIN_DISTANCE);
    safeCount = strict.length;
    colors =
      strict.length >= Math.min(count, 8)
        ? strict
        : pickCategorical(Math.min(count, 8), background, 35, strict);
  } else {
    const stops = kind === 'sequential' ? ['#e0f2fe', '#0369a1'] : ['#b91c1c', '#f5f5f4', '#1d4ed8'];
    const lerp = (a: RGB, b: RGB, t: number): RGB => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
    colors = Array.from({ length: count }, (_, i) => {
      const t = count === 1 ? 0 : i / (count - 1);
      const segs = stops.length - 1,
        p = t * segs,
        k = Math.min(segs - 1, Math.floor(p));
      return rgbToHex(lerp(hexToRgb(stops[k]), hexToRgb(stops[k + 1]), p - k));
    });
  }
  const type =
    kind === 'categorical' ? 'regular' : kind === 'sequential' ? 'ordered-sequential' : 'ordered-diverging';
  const tps = `<?xml version='1.0'?>\n<workbook>\n  <preferences>\n    <color-palette name="${name}" type="${type}">\n${colors.map((c) => `      <color>${c}</color>`).join('\n')}\n    </color-palette>\n  </preferences>\n</workbook>`;
  return {
    kind,
    colors,
    fullySafeCount: safeCount,
    note:
      safeCount < colors.length
        ? `Only the first ${safeCount} colors are fully colorblind-safe; add shape, labels or direct labeling beyond that.`
        : null,
    tableauPreferencesXml: tps,
    check: analyzeColors(colors, background),
  };
}

/** The CVD matrices, for drawing a whole image the way color-blind viewers see it (e.g. an SVG feColorMatrix). */
export const CVD_MATRICES = CVD;

/**
 * The colors a chart actually uses, read from a screenshot's pixels (RGBA, row after row).
 * Pixels are grouped into coarse color bins; the most common bin is the background; the chart colors are the
 * saturated bins that cover a visible share of the image, with near-duplicates merged (anti-aliased edges and
 * gradients produce many neighbors of one color). Grays and near-background tints are left out: they are text,
 * gridlines and panels, not data colors.
 */
export function paletteFromPixels(
  data: ArrayLike<number>,
  opts: { maxColors?: number; minShare?: number } = {},
): { background: string; colors: { hex: string; share: number }[] } {
  const maxColors = opts.maxColors ?? 8,
    minShare = opts.minShare ?? 0.002;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 200) continue; // skip transparent pixels
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    bins.set(key, e);
    total++;
  }
  if (!total) return { background: '#ffffff', colors: [] };
  const list = [...bins.values()]
    .map((e) => ({ rgb: [e.r / e.n, e.g / e.n, e.b / e.n] as RGB, n: e.n }))
    .sort((a, b) => b.n - a.n);
  const bg = list[0].rgb;
  // Chroma (max − min channel) separates data colors from grays, text and the faint tints of dark-mode panels.
  const chroma = ([r, g, b]: RGB) => Math.max(r, g, b) - Math.min(r, g, b);
  // Anti-aliased edges and glows are mixes of a color with the background: c ≈ bg + t·(p − bg).
  const blendOf = (c: RGB, p: RGB) => {
    const d = [p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]];
    const len2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
    if (!len2) return false;
    const t = ((c[0] - bg[0]) * d[0] + (c[1] - bg[1]) * d[1] + (c[2] - bg[2]) * d[2]) / len2;
    if (t < 0.12 || t > 1.05) return false;
    const proj: RGB = [bg[0] + t * d[0], bg[1] + t * d[1], bg[2] + t * d[2]];
    return dist(proj, c) < 30;
  };
  const picked: { rgb: RGB; n: number }[] = [];
  for (const c of list.slice(1)) {
    if (chroma(c.rgb) < 50 || dist(c.rgb, bg) < 45) continue;
    const near = picked.find((p) => dist(p.rgb, c.rgb) < 48 || blendOf(c.rgb, p.rgb));
    if (near) near.n += c.n;
    else picked.push({ ...c });
  }
  return {
    background: rgbToHex(bg),
    colors: picked
      .filter((p) => p.n / total >= minShare)
      .sort((a, b) => b.n - a.n)
      .slice(0, maxColors)
      .map((p) => ({ hex: rgbToHex(p.rgb), share: Math.round((p.n / total) * 10000) / 10000 })),
  };
}
