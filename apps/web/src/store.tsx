import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { IngestReport, Role, DateOrder } from '@blindspot/analytics';
import { fileToText, type FileText } from './lib/fileText';
import { baseCurrency, display, get, setCurrency, setDisplay, tool, SID } from './api';

export interface Finding { id: string; category: string; title: string; severity: string; confidence: number; metric: string; explanation: string; evidence: any; impactUsd: number | null; impactBasis: string | null; nextAction: string; score: number }
export interface Action { findingId: string; problem: string; intervention: string; expectedBenefitUsd: number | null; benefitKind: 'profit' | 'revenue'; benefitBasis: string; effort: 'low' | 'medium' | 'high'; risks: string; severity: string; benefitToEffort: number | null; evidence: any }
export interface DatasetMeta { name: string; source: string; label: string; currency: string; prep: Record<string, any> | null; citation: string | null; caseStudyAvailable: boolean; rows: number; totalRows: number; filters: Record<string, string[]>; fields: { measure: string; profit: string | null; date: string | null; dims: string[]; highCardDims: string[] }; columns: { name: string; type: string; distinct: number; values?: string[] }[] }
export interface Dash { kpis: { label: string; value: number; format: string }[]; charts: { id: string; type: string; title: string; data: any[] }[] }

export interface FxInfo { base: string; to: string; live: boolean; date: string; rates: Record<string, number>; names: Record<string, string> }
const fxCache = new Map<string, Promise<Omit<FxInfo, 'to'>>>();
const ratesFor = (base: string) => { let p = fxCache.get(base); if (!p) { p = get('/api/fx?base=' + base); fxCache.set(base, p); p.catch(() => fxCache.delete(base)); } return p; };

export interface UploadState { staged: File[]; raw: File[]; files: FileText[]; report: IngestReport | null; error: string | null; busy: string | null; open: boolean; overrides: Partial<Record<Role, string | null>>; dateOrder?: DateOrder }

interface Store {
  dataset: DatasetMeta | null; findings: Finding[]; bySeverity: Record<string, number>; actions: Action[]; dash: Dash | null; health: any; conn: any;
  loading: boolean; version: number; extension: boolean; events: { name: string; payload: any; at: string }[]; fx: FxInfo | null;
  upload: UploadState;
  uploadFiles: (files: File[], mode?: 'replace' | 'add') => Promise<'ok' | 'fixable' | 'failed'>;
  fixUpload: (overrides: Partial<Record<Role, string | null>>, dateOrder?: DateOrder) => Promise<void>;
  setReviewOpen: (open: boolean) => void;
  stageFiles: (files: File[]) => void; unstage: (i: number) => void; readStaged: (mode?: 'replace' | 'add') => Promise<'ok' | 'fixable' | 'failed'>; goBackToFiles: () => void;
  refresh: () => Promise<void>; setDisplayCurrency: (code: string) => Promise<void>; setFilter: (field: string, values: string[]) => Promise<void>; clearFilters: () => Promise<void>;
}
const Ctx = createContext<Store>(null as any);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Omit<Store, 'refresh' | 'setFilter' | 'clearFilters' | 'setDisplayCurrency' | 'uploadFiles' | 'fixUpload' | 'setReviewOpen' | 'stageFiles' | 'unstage' | 'readStaged' | 'goBackToFiles'>>({ upload: { staged: [], raw: [], files: [], report: null, error: null, busy: null, open: false, overrides: {} }, fx: null, dataset: null, findings: [], bySeverity: {}, actions: [], dash: null, health: null, conn: null, loading: true, version: 0, extension: false, events: [] });
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
      if (retries.current < 25) { const wait = Math.min(8000, 500 * 2 ** retries.current++); setTimeout(() => refreshRef.current(), wait); } // keeps trying ~3 min while a sleeping server wakes
    }
    finally { busy.current = false; }
  }, []);
  refreshRef.current = refresh;
  const setDisplayCurrency = useCallback(async (code: string) => {
    const base = baseCurrency();
    try { const t = await ratesFor(base); setDisplay(code === base ? '' : code, t.rates[code] ?? 1); } catch { return; }
    await refresh();
  }, [refresh]);
  // ---- uploads: files are kept in the browser so a column fix or an extra file re-reads everything instantly
  const uploadRef = useRef<UploadState>(s.upload);
  const setUpload = (u: Partial<UploadState>) => setS((p) => { const next = { ...p.upload, ...u }; uploadRef.current = next; return { ...p, upload: next }; });
  const send = useCallback(async (files: FileText[], overrides: Partial<Record<Role, string | null>>, dateOrder?: DateOrder) => {
    setUpload({ busy: 'Reading every row…', error: null, open: true });
    try {
      const r = await fetch('/api/dataset/files', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Id': SID }, body: JSON.stringify({ files: files.map(({ name, text }) => ({ name, text })), overrides, dateOrder }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setUpload({ files, overrides, dateOrder, busy: null, report: j.report ?? null, error: j.error?.message ?? 'This file couldn\'t be read.' }); return j.report?.columns ? 'fixable' as const : 'failed' as const; }
      setUpload({ files, overrides, dateOrder, busy: null, report: j.report, error: null });
      await refresh();
      return 'ok' as const;
    } catch { setUpload({ busy: null, error: 'Couldn\'t reach the server. Try again in a moment.' }); return 'failed' as const; }
  }, [refresh]);
  const uploadFiles = useCallback(async (list: File[], mode: 'replace' | 'add' = 'replace') => {
    setUpload({ busy: list.length > 1 ? `Opening ${list.length} files…` : `Opening ${list[0]?.name}…`, error: null, open: true });
    let read: FileText[];
    try { read = await Promise.all(list.map(fileToText)); }
    catch (e: any) { setUpload({ busy: null, error: e?.message ?? 'This file couldn\'t be opened.', report: null, files: list.map((f) => ({ name: f.name, text: '', kind: /\.pdf$/i.test(f.name) ? 'pdf' as const : 'csv' as const })) }); return 'failed' as const; }
    const prev = uploadRef.current;
    const files = mode === 'add' ? [...prev.files, ...read].slice(0, 5) : read;
    setUpload({ raw: mode === 'add' ? [...prev.raw, ...list].slice(0, 5) : list });
    return send(files, mode === 'add' ? prev.overrides : {}, mode === 'add' ? prev.dateOrder : undefined);
  }, [send]);
  const fixUpload = useCallback(async (overrides: Partial<Record<Role, string | null>>, dateOrder?: DateOrder) => {
    const u = uploadRef.current;
    if (u.files.length) await send(u.files, overrides, dateOrder ?? u.dateOrder);
  }, [send]);
  const setReviewOpen = useCallback((open: boolean) => setUpload({ open }), []);
  // Files wait in a list (removable) until Next is pressed; only then is anything read.
  const stageFiles = useCallback((list: File[]) => {
    const cur = uploadRef.current.staged, key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
    setUpload({ staged: [...cur, ...list.filter((f) => !cur.some((c) => key(c) === key(f)))].slice(0, 5), error: null });
  }, []);
  const unstage = useCallback((i: number) => setUpload({ staged: uploadRef.current.staged.filter((_, k) => k !== i) }), []);
  const readStaged = useCallback(async (mode: 'replace' | 'add' = 'replace') => {
    const list = uploadRef.current.staged;
    if (!list.length) return 'failed' as const;
    const r = await uploadFiles(list, mode);
    if (r !== 'failed') setUpload({ staged: [] });
    return r;
  }, [uploadFiles]);
  // "Go back": close the report and put the files back in the list so they can be removed, swapped or added to.
  const goBackToFiles = useCallback(() => setUpload({ open: false, staged: uploadRef.current.raw.slice(), error: null }), []);

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

  const value = useMemo(() => ({ ...s, refresh, setFilter, clearFilters, setDisplayCurrency, uploadFiles, fixUpload, setReviewOpen, stageFiles, unstage, readStaged, goBackToFiles }), [s, refresh, setFilter, clearFilters, setDisplayCurrency, uploadFiles, fixUpload, setReviewOpen, stageFiles, unstage, readStaged, goBackToFiles]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
