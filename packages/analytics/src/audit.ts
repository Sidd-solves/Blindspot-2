import type { DashboardSpec } from './charts';
import { analyzeColors } from './color';

export interface AuditIssue { area: 'chart-integrity' | 'hierarchy' | 'accessibility' | 'labels' | 'color'; severity: 'high' | 'medium' | 'low'; target: string; message: string; fix: string; }

export function auditDashboard(spec: DashboardSpec) {
  const issues: AuditIssue[] = [];
  for (const c of spec.charts) {
    if (!c.title) issues.push({ area: 'labels', severity: 'medium', target: c.id, message: 'Chart has no title.', fix: 'Add a title that states what is measured.' });
    if (c.hasAxisLabels === false) issues.push({ area: 'labels', severity: 'medium', target: c.id, message: 'Axes are unlabeled.', fix: 'Label axes with field name and units.' });
    if (c.type === 'bar' && c.yAxisStartsAtZero === false) issues.push({ area: 'chart-integrity', severity: 'high', target: c.id, message: 'Bar chart axis does not start at zero, which exaggerates differences.', fix: 'Start the axis at zero.' });
    if (c.type === 'pie' && (c.slices ?? 0) > 5) issues.push({ area: 'chart-integrity', severity: 'medium', target: c.id, message: `Pie has ${c.slices} slices; angles are hard to compare.`, fix: 'Use a sorted bar chart.' });
    if (c.dualAxis) issues.push({ area: 'chart-integrity', severity: 'medium', target: c.id, message: 'Dual axis can imply a correlation that is just scaling.', fix: 'Use two aligned charts or index both series.' });
    if ((c.series ?? 0) > 8) issues.push({ area: 'color', severity: 'medium', target: c.id, message: `${c.series} series exceed distinguishable colors.`, fix: 'Highlight top series and group the rest.' });
    if (c.colors?.length) for (const i of analyzeColors(c.colors, spec.background ?? '#ffffff').issues) issues.push({ area: 'accessibility', severity: i.severity, target: c.id, message: i.message, fix: 'Use a colorblind-safe palette (see generate-tableau-palette).' });
  }
  if (spec.charts.length > 8) issues.push({ area: 'hierarchy', severity: 'medium', target: 'dashboard', message: `${spec.charts.length} charts compete for attention.`, fix: 'Lead with 1 hero chart and 3 to 5 supporting views.' });
  if ((spec.kpiCount ?? 0) === 0) issues.push({ area: 'hierarchy', severity: 'low', target: 'dashboard', message: 'No headline KPIs.', fix: 'Add 3 to 4 KPI cards at top-left.' });
  if (spec.minFontPx !== undefined && spec.minFontPx < 11) issues.push({ area: 'accessibility', severity: 'medium', target: 'dashboard', message: `Smallest font is ${spec.minFontPx}px.`, fix: 'Keep body text at 11px or larger.' });
  if (!spec.hasFilters) issues.push({ area: 'hierarchy', severity: 'low', target: 'dashboard', message: 'No visible filters for exploration.', fix: 'Add region/time filters.' });
  const w = { high: 12, medium: 6, low: 2 };
  const score = Math.max(0, 100 - issues.reduce((s, i) => s + w[i.severity], 0));
  return { score, grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D', issues };
}

export function critiqueStyle(spec: DashboardSpec, findingsCount: number) {
  const a = auditDashboard(spec);
  const clarity = Math.max(1, 5 - a.issues.filter((i) => i.area !== 'color').length * 0.5);
  const storytelling = Math.min(5, 2 + (spec.kpiCount ? 1 : 0) + (findingsCount > 0 ? 1 : 0) + (spec.charts.every((c) => c.title) ? 1 : 0));
  return {
    disclaimer: 'Heuristic critique in the spirit of Tableau visualization best practice. Not an official Iron Viz score.',
    scores: { clarity: Math.round(clarity * 10) / 10, storytelling, analyticalUsefulness: Math.min(5, 2 + Math.min(3, findingsCount)) },
    strengths: a.issues.length < 3 ? ['Few integrity or labeling problems.'] : [],
    improvements: a.issues.slice(0, 4).map((i) => i.fix),
  };
}
