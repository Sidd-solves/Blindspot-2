export interface ToolResult<T = any> { ok: boolean; tool: string; ms: number; data?: T; error?: { code: string; message: string } }

const adminToken = () => { try { return sessionStorage.getItem('ciq-admin') ?? ''; } catch { return ''; } };

export async function tool<T = any>(name: string, input: unknown = {}): Promise<ToolResult<T>> {
  const t = adminToken();
  const r = await fetch(`/api/tools/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(input) });
  return r.json();
}
export async function get<T = any>(path: string): Promise<T> { const r = await fetch(path); if (!r.ok) throw new Error((await r.json()).error?.message ?? r.statusText); return r.json(); }
export async function post<T = any>(path: string, body: unknown, type = 'application/json'): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': type }, body: type === 'application/json' ? JSON.stringify(body) : (body as string) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? r.statusText);
  return j;
}

// Money is shown in the active dataset's currency (set by the store whenever the dataset changes).
let currency = 'USD';
export const setCurrency = (c: string) => { currency = c || 'USD'; };
export const usd = (n: number | null | undefined, compact = false) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: compact ? 1 : 0, ...(compact ? { notation: 'compact' as const } : {}) }).format(n);
export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
export const ago = (iso: string, now = Date.now()) => { const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };

export const SEV: Record<string, { c: string; label: string; w: number }> = {
  critical: { c: 'var(--rose)', label: 'Critical', w: 4 }, high: { c: 'var(--orange)', label: 'High', w: 3 }, medium: { c: 'var(--amber)', label: 'Medium', w: 2 }, low: { c: 'var(--sky)', label: 'Low', w: 1 },
};
export const CAT: Record<string, { c: string; label: string }> = {
  concentration: { c: 'var(--violet)', label: 'Concentration' }, profitability: { c: 'var(--rose)', label: 'Profitability' }, trend: { c: 'var(--amber)', label: 'Trend' },
  pricing: { c: 'var(--fuchsia)', label: 'Pricing' }, outlier: { c: 'var(--cyan)', label: 'Big orders' }, 'data-quality': { c: 'var(--blue)', label: 'Data quality' },
  returns: { c: 'var(--orange)', label: 'Returns' }, retention: { c: 'var(--emerald)', label: 'Retention' }, product: { c: 'var(--lime)', label: 'Products' },
  seasonality: { c: 'var(--sky)', label: 'Seasonality' }, anomaly: { c: 'var(--rose)', label: 'Anomaly' },
};
export const TOOL_CAT: Record<string, string> = {
  'Data Analysis': 'var(--violet)', Visualization: 'var(--cyan)', 'Design Analysis': 'var(--fuchsia)', Interaction: 'var(--emerald)', Interpretation: 'var(--amber)', Orchestration: 'var(--blue)', Documentation: 'var(--lime)', Utilities: 'var(--sky)', 'Business Intelligence': 'var(--rose)',
};
