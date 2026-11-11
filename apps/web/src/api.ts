/** A private, random visitor ID so each visitor's uploads and filters are their own. */
export const SID = (() => {
  const make = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '');
  try { let v = localStorage.getItem('bs-sid'); if (!v || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) { v = make(); localStorage.setItem('bs-sid', v); } return v; } catch { return make(); }
})();
// The visitor's chosen display currency ('' = the data's own). The server converts money in text; usd() converts numbers.
const readCur = () => { try { return localStorage.getItem('bs-cur') ?? ''; } catch { return ''; } };
export const display = { to: readCur(), rate: 1 };
const hdr = (): Record<string, string> => ({ 'X-Session-Id': SID, ...(display.to ? { 'X-Display-Currency': display.to } : {}) });
export function setDisplay(to: string, rate: number) {
  display.to = to; display.rate = to ? rate : 1;
  try { to ? localStorage.setItem('bs-cur', to) : localStorage.removeItem('bs-cur'); } catch { /* ignore */ }
}

export interface ToolResult<T = any> { ok: boolean; tool: string; ms: number; data?: T; error?: { code: string; message: string } }

const adminToken = () => { try { return sessionStorage.getItem('ciq-admin') ?? ''; } catch { return ''; } };

export async function tool<T = any>(name: string, input: unknown = {}): Promise<ToolResult<T>> {
  const t = adminToken();
  // Never throws: a down or restarting server becomes a normal error result the UI can show.
  try {
    const r = await fetch(`/api/tools/${name}`, { method: 'POST', headers: { ...hdr(), 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(input) });
    return await r.json();
  } catch {
    return { ok: false, tool: name, ms: 0, error: { code: 'UNREACHABLE', message: 'The server is starting up or unreachable. Try again in a moment.' } };
  }
}
export async function get<T = any>(path: string): Promise<T> { const r = await fetch(path, { headers: hdr() }); if (!r.ok) throw new Error((await r.json()).error?.message ?? r.statusText); return r.json(); }
export async function post<T = any>(path: string, body: unknown, type = 'application/json'): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { ...hdr(), 'Content-Type': type }, body: type === 'application/json' ? JSON.stringify(body) : (body as string) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? r.statusText);
  return j;
}

// Money is shown in the active dataset's currency (set by the store whenever the dataset changes).
let currency = 'USD';
export const setCurrency = (c: string) => { currency = c || 'USD'; };
export const baseCurrency = () => currency;
export const shownCurrency = () => (display.to && display.to !== currency ? display.to : currency);
export const usd = (n: number | null | undefined, compact = false) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: shownCurrency(), maximumFractionDigits: compact ? 1 : 0, ...(compact ? { notation: 'compact' as const } : {}) }).format(shownCurrency() === currency ? n : n * display.rate);
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
