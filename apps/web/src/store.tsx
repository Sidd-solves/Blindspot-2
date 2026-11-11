import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { baseCurrency, display, get, setCurrency, setDisplay, tool, SID } from './api';

export interface Finding { id: string; category: string; title: string; severity: string; confidence: number; metric: string; explanation: string; evidence: any; impactUsd: number | null; impactBasis: string | null; nextAction: string; score: number }
export interface Action { findingId: string; problem: string; intervention: string; expectedBenefitUsd: number | null; benefitKind: 'profit' | 'revenue'; benefitBasis: string; effort: 'low' | 'medium' | 'high'; risks: string; severity: string; benefitToEffort: number | null; evidence: any }
export interface DatasetMeta { name: string; source: string; label: string; currency: string; prep: Record<string, any> | null; citation: string | null; caseStudyAvailable: boolean; rows: number; totalRows: number; filters: Record<string, string[]>; fields: { measure: string; profit: string | null; date: string | null; dims: string[]; highCardDims: string[] }; columns: { name: string; type: string; distinct: number; values?: string[] }[] }
export interface Dash { kpis: { label: string; value: number; format: string }[]; charts: { id: string; type: string; title: string; data: any[] }[] }

export interface FxInfo { base: string; to: string; live: boolean; date: string; rates: Record<string, number>; names: Record<string, string> }
const fxCache = new Map<string, Promise<Omit<FxInfo, 'to'>>>();
const ratesFor = (base: string) => { let p = fxCache.get(base); if (!p) { p = get('/api/fx?base=' + base); fxCache.set(base, p); p.catch(() => fxCache.delete(base)); } return p; };

interface Store {
  dataset: DatasetMeta | null; findings: Finding[]; bySeverity: Record<string, number>; actions: Action[]; dash: Dash | null; health: any; conn: any;
  loading: boolean; version: number; extension: boolean; events: { name: string; payload: any; at: string }[]; fx: FxInfo | null;
  refresh: () => Promise<void>; setDisplayCurrency: (code: string) => Promise<void>; setFilter: (field: string, values: string[]) => Promise<void>; clearFilters: () => Promise<void>;
}
const Ctx = createContext<Store>(null as any);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Omit<Store, 'refresh' | 'setFilter' | 'clearFilters' | 'setDisplayCurrency'>>({ fx: null, dataset: null, findings: [], bySeverity: {}, actions: [], dash: null, health: null, conn: null, loading: true, version: 0, extension: false, events: [] });
  const busy = useRef(false);
  const retries = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setS((p) => ({ ...p, loading: true }));
    try {
      const [dataset, a, r, d, health, conn] = await Promise.all([get<DatasetMeta>('/api/dataset'), tool('analyze-dashboard-smart', { top: 30 }), tool('recommend-actions', { top: 10 }), tool('build-dashboard', { title: 'Overview' }), get('/api/health'), tool('check-connection')]);
      await tool('clear-canvas');
      setCurrency(dataset.currency);
      let fx: FxInfo | null = null;
      try { const t = await ratesFor(dataset.currency); fx = { ...t, to: display.to || dataset.currency }; setDisplay(display.to, t.rates[display.to] ?? 1); } catch { setDisplay('', 1); }
      setS((p) => ({ ...p, fx, dataset, findings: a.data?.findings ?? [], bySeverity: a.data?.bySeverity ?? {}, actions: r.data?.actions ?? [], dash: d.ok ? d.data : null, health, conn: conn.data, extension: !!health.extension, loading: false, version: p.version + 1 }));
      retries.current = 0;
    } catch {
      // API may be restarting: retry with backoff instead of leaving the app empty.
      setS((p) => ({ ...p, loading: false }));
      if (retries.current < 6) { const wait = 500 * 2 ** retries.current++; setTimeout(() => refreshRef.current(), wait); }
    }
    finally { busy.current = false; }
  }, []);
  refreshRef.current = refresh;
  const setDisplayCurrency = useCallback(async (code: string) => {
    const base = baseCurrency();
    try { const t = await ratesFor(base); setDisplay(code === base ? '' : code, t.rates[code] ?? 1); } catch { return; }
    await refresh();
  }, [refresh]);
  const setFilter = useCallback(async (field: string, values: string[]) => {
    await tool('apply-filter', { field, values, mode: values.length ? 'replace' : 'clear', target: 'session' });
    await refresh();
  }, [refresh]);
  const clearFilters = useCallback(async () => {
    const f = s.dataset?.filters ?? {};
    for (const field of Object.keys(f)) await tool('apply-filter', { field, values: [], mode: 'clear', target: 'session' });
    await refresh();
  }, [refresh, s.dataset]);

  useEffect(() => {
    refresh();
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/events?sid=${SID}`);
      const push = (name: string) => (e: MessageEvent) => {
        const payload = JSON.parse(e.data);
        setS((p) => ({ ...p, events: [{ name, payload, at: new Date().toISOString() }, ...p.events].slice(0, 30), extension: name === 'extensionStatus' ? !!payload.connected : name === 'hello' ? !!payload.extension : p.extension }));
        if (name === 'filterChanged' || name === 'extensionStatus') refresh();
      };
      ['hello', 'state', 'filterChanged', 'parameterChanged', 'extensionStatus'].forEach((n) => es!.addEventListener(n, push(n) as any));
    } catch { /* SSE unavailable: the app still works by polling on actions */ }
    return () => es?.close();
  }, [refresh]);

  const value = useMemo(() => ({ ...s, refresh, setFilter, clearFilters, setDisplayCurrency }), [s, refresh, setFilter, clearFilters, setDisplayCurrency]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
