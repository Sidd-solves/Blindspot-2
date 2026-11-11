import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { callTool, listTools, SessionState, screenUserInput, redactSecrets, type ToolContext } from '@blindspot/tool-contracts';
import { parseCsv, generateSampleDataset, profileData, detectFields, crosstab, ingest, IngestError, ROLES } from '@blindspot/analytics';
import { BridgeHub } from './bridge';
import { makeLlm, claudeChat, MODELS, getModel, setModel, type ModelId } from './llm';
import { deterministicAnswer } from './deterministic';
import { zodToJsonSchema } from './zod-json';
import { fetchShopifyDataset, ShopifyError } from './shopify';
import { loadCaseStudy, caseStudyAvailable, CASE_STUDY_CITATION } from './case-study';
import { analyzeSmart, profileData as profile } from '@blindspot/analytics';
import { CURRENCIES, ratesFor, displayRate } from './fx';
import { convertMoneyDeep } from '@blindspot/analytics';

// Load the repo-root .env for local runs (hosted platforms inject real env vars, which take precedence).
const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const env = process.env;
const PROD = env.NODE_ENV === 'production';
const PORT = Number(env.PORT ?? 8787);
/** Rows read per upload. 100k keeps the free 512 MB server safe with the case study loaded; raise on a bigger plan. */
const UPLOAD_MAX_ROWS = Number(env.UPLOAD_MAX_ROWS ?? 100_000);
const ORIGINS = (env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8765,http://localhost:8765').split(',').map((s) => s.trim());
const SENSITIVE = new Set(['get-worksheet-data', 'set-parameter', 'get-dashboard-screenshot']);
const log = (m: string) => console.log(`[api] ${new Date().toISOString()} ${redactSecrets(m)}`);

const app = express();
const server = createServer(app);
import { Sessions, sidOf } from './sessions';
const llm = makeLlm();
const bridge = new BridgeHub(server, { token: env.BRIDGE_TOKEN, allowedOrigins: ORIGINS, log });
const sessions = new Sessions(generateSampleDataset(), { bridge, llm, rest: { serverUrl: env.TABLEAU_SERVER_URL, site: env.TABLEAU_SITE, patName: env.TABLEAU_PAT_NAME, patSecret: env.TABLEAU_PAT_SECRET } });
const sid = (req: Request) => sidOf(req.headers['x-session-id'] ?? req.query.sid);
let caseStudyCache: ReturnType<typeof loadCaseStudy> | null = null;
const caseStudy = () => (caseStudyCache ??= loadCaseStudy());
const activity: { tool: string; ok: boolean; ms: number; at: string }[] = [];
const sse = new Map<Response, string>();
const send = (r: Response, name: string, payload: unknown) => r.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
/** Session-scoped events (dataset/filter changes) go only to that visitor; Tableau bridge events go to everyone. */
const broadcastTo = (id: string, name: string, payload: unknown) => { for (const [r, s] of sse) if (s === id) send(r, name, payload); };
bridge.onEvent((e) => { for (const r of sse.keys()) send(r, e.name, e.payload); });

app.disable('x-powered-by');
app.use((_req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN' }); next(); });
app.use('/api', cors({ origin: (o, cb) => cb(null, !o || ORIGINS.includes(o)), credentials: false }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
const chatLimit = rateLimit({ windowMs: 60_000, limit: 20 });
// Each visitor can pick a display currency (X-Display-Currency); money in findings and reports is converted for them.
app.use('/api', (req, res, next) => {
  const cur = req.headers['x-display-currency'] ?? req.query.cur;
  if (!cur) return next();
  const from = sessions.get(sid(req)).view().currency ?? 'USD';
  displayRate(from, cur).then((fx) => {
    if (fx) { const json = res.json.bind(res); res.json = (body: unknown) => json(convertMoneyDeep(body, from, fx.to, fx.rate)); }
    next();
  }, () => next());
});

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const want = env.ADMIN_TOKEN;
  if (!want) return PROD ? res.status(503).json({ error: { code: 'ADMIN_TOKEN_NOT_SET', message: 'Sensitive endpoints are disabled until ADMIN_TOKEN is configured.' } }) : next();
  const got = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want))) return next();
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin token required.' } });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, ...sessions.count(), tools: listTools().length, extension: bridge.isConnected(), ai: llm.configured ? llm.model : null }));

app.get('/api/tools', (_req, res) => res.json(listTools().map((t) => ({ name: t.name, category: t.category, core: t.core, description: t.description, sensitive: SENSITIVE.has(t.name), inputSchema: zodToJsonSchema(t.input) }))));

app.post('/api/tools/:name', express.json({ limit: '8mb' }), (req, res, next) => (SENSITIVE.has(req.params.name) ? requireAdmin(req, res, next) : next()), async (req, res) => {
  const id = sid(req), ctx = sessions.ctx(id), state = ctx.state;
  const r = await callTool(ctx, req.params.name, req.body ?? {});
  activity.unshift({ tool: r.tool, ok: r.ok, ms: r.ms, at: new Date().toISOString() });
  activity.length = Math.min(activity.length, 50);
  if (!r.ok) log(`tool ${r.tool} failed: ${r.error?.code}`);
  if (r.ok && ['apply-filter', 'get-worksheet-data', 'clear-canvas'].includes(r.tool)) broadcastTo(id, 'state', { filters: Object.fromEntries(state.filters), rows: state.view().rows.length });
  res.status(r.ok ? 200 : r.error?.code === 'UNKNOWN_TOOL' ? 404 : 400).json(r);
});

app.get('/api/settings', (_req, res) => res.json({ model: getModel(), models: MODELS, aiConfigured: llm.configured, bridgeTokenRequired: !!env.BRIDGE_TOKEN, adminTokenRequired: !!env.ADMIN_TOKEN, restConfigured: !!(env.TABLEAU_SERVER_URL && env.TABLEAU_PAT_NAME) }));
app.post('/api/settings/model', express.json({ limit: '1kb' }), (req, res) => {
  const m = z.enum(MODELS).safeParse(req.body?.model);
  if (!m.success) return res.status(400).json({ error: { code: 'INVALID_MODEL', message: `Model must be one of ${MODELS.join(', ')}` } });
  setModel(m.data as ModelId);
  res.json({ model: getModel() });
});

app.get('/api/activity', (_req, res) => res.json(activity.slice(0, 20)));

app.get('/api/dataset', (req, res) => {
  const state = sessions.get(sid(req)), v = state.view();
  res.json({ name: v.name, source: v.source, label: v.label, currency: v.currency ?? 'USD', prep: v.prep ?? null, citation: v.source === 'case-study' ? CASE_STUDY_CITATION : null, caseStudyAvailable: caseStudyAvailable(), rows: v.rows.length, totalRows: state.dataset.rows.length, filters: Object.fromEntries(state.filters), fields: detectFields(v), columns: profileData(v).columns.map((c) => ({ name: c.name, type: c.type, distinct: c.distinct, values: c.type === 'category' ? [...new Set(state.dataset.rows.map((r) => String(r[c.name] ?? '')))].sort().slice(0, 50) : undefined })) });
});

app.get('/api/crosstab', (req, res) => {
  const q = z.object({ row: z.string().max(100), col: z.string().max(100), measure: z.string().max(100), ratioOf: z.string().max(100).optional() }).safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'row, col, measure required' } });
  const state = sessions.get(sid(req));
  const cols = new Set(profileData(state.view()).columns.map((c) => c.name));
  for (const f of [q.data.row, q.data.col, q.data.measure, q.data.ratioOf].filter(Boolean) as string[]) if (!cols.has(f)) return res.status(400).json({ error: { code: 'UNKNOWN_FIELD', message: `Unknown field ${f}` } });
  res.json(crosstab(state.view().rows, q.data.row, q.data.col, q.data.measure, q.data.ratioOf));
});

app.get('/api/fx', async (req, res) => {
  const base = z.string().regex(/^[A-Z]{3}$/).catch('USD').parse(req.query.base);
  const t = await ratesFor(base in CURRENCIES ? base : 'USD');
  res.json({ ...t, names: CURRENCIES });
});

/** The exact rows being analysed (after cleaning and the visitor's filters), so anyone can check the numbers. */
app.get('/api/rows', (req, res) => {
  const q = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(200).default(50), q: z.string().max(100).default('') }).parse(req.query);
  const v = sessions.get(sid(req)).view(), all = v.rows, needle = q.q.trim().toLowerCase();
  const columns = all.length ? Object.keys(all[0]) : [];
  const matched = needle ? all.filter((r) => columns.some((c) => String(r[c] ?? '').toLowerCase().includes(needle))) : all;
  const fm = detectFields(v), tx = all[0] && 'IsReturn' in all[0];
  let sales = 0, returns = 0;
  const orders = new Set<string>(), customers = new Set<string>();
  for (const r of all) {
    const m = typeof r[fm.measure] === 'number' ? (r[fm.measure] as number) : 0;
    if ('Customer' in r && r.Customer !== 'Unknown customer' && r.Customer !== 'Guest checkout') customers.add(String(r.Customer));
    if (tx && r.IsReturn === 1) { returns += m; continue; }
    sales += m;
    if ('Order' in r) orders.add(String(r.Order));
  }
  res.json({ columns, total: all.length, matched: matched.length, rows: matched.slice(q.offset, q.offset + q.limit), measure: fm.measure, currency: v.currency ?? 'USD',
    totals: { sales: Math.round(sales), returns: Math.round(returns), orders: orders.size || all.length, customers: customers.size, lines: all.length } });
});

app.get('/api/rows.csv', (req, res) => {
  const v = sessions.get(sid(req)).view(), cols = v.rows.length ? Object.keys(v.rows[0]) : [];
  const esc = (x: unknown) => { const t = x == null ? '' : String(x); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${v.name.replace(/[^\w -]/g, '').trim() || 'data'}.csv"` });
  res.write(cols.join(',') + '\n');
  for (let i = 0; i < v.rows.length; i += 5000) res.write(v.rows.slice(i, i + 5000).map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n') + '\n');
  res.end();
});

/**
 * Universal upload: one or more files (CSV text; the browser turns Excel and PDF into text first), optional
 * column fixes. Returns the reading report either way, so the person can see and fix how the file was read.
 */
app.post('/api/dataset/files', express.json({ limit: '40mb' }), (req, res) => {
  const p = z.object({
    files: z.array(z.object({ name: z.string().max(160).transform((x) => x.replace(/[^\w .()\-]/g, '').trim() || 'Uploaded file'), text: z.string().min(1).max(30_000_000) })).min(1).max(5),
    overrides: z.partialRecord(z.enum(ROLES), z.string().max(200).nullable()).optional(),
    dateOrder: z.enum(['ymd', 'mdy', 'dmy']).optional(),
    currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Send up to 5 files as { name, text }.' } });
  try {
    const { dataset, report } = ingest(p.data.files, { overrides: p.data.overrides, dateOrder: p.data.dateOrder, currency: p.data.currency, maxRows: UPLOAD_MAX_ROWS });
    if (dataset.rows.length < 1) return res.status(400).json({ error: { code: 'NO_ROWS', message: 'No usable rows were found.' }, report });
    sessions.setDataset(sid(req), dataset, true);
    broadcastTo(sid(req), 'state', { dataset: dataset.name, rows: dataset.rows.length });
    log(`files loaded: ${p.data.files.length} file(s), ${dataset.rows.length} rows, format=${report.format}`);
    res.json({ ok: true, name: dataset.name, rows: dataset.rows.length, report });
  } catch (e: any) {
    if (e instanceof IngestError) return res.status(400).json({ error: { code: e.code, message: e.message }, report: e.report ?? null });
    log(`ingest failed: ${e?.message}`);
    res.status(400).json({ error: { code: 'READ_FAILED', message: 'This file couldn\'t be read. Check that it\'s a sales export (CSV, Excel or a PDF with a table).' } });
  }
});

app.post('/api/dataset/csv', express.text({ type: ['text/csv', 'text/plain'], limit: '15mb' }), (req, res) => {
  const name = z.string().max(120).regex(/^[\w .()-]*$/).catch('Uploaded CSV').parse(req.query.name);
  if (typeof req.body !== 'string' || !req.body.trim()) return res.status(400).json({ error: { code: 'EMPTY', message: 'Send CSV text as the request body.' } });
  const ds = parseCsv(req.body, name || 'Uploaded CSV', 150_000); // keeps the free server safe; ~150k lines per upload
  if (ds.rows.length >= 150_000) log('upload capped at 150k rows');
  if (ds.rows.length < 2) return res.status(400).json({ error: { code: 'TOO_FEW_ROWS', message: 'CSV needs a header and at least 2 rows.' } });
  if (!detectFields(ds).measure) return res.status(400).json({ error: { code: 'NO_MEASURE', message: 'CSV needs at least one numeric column.' } });
  sessions.setDataset(sid(req), ds, true);
  broadcastTo(sid(req), 'state', { dataset: ds.name, rows: ds.rows.length });
  log(`dataset replaced: ${ds.rows.length} rows`);
  res.json({ ok: true, name: ds.name, rows: ds.rows.length });
});

// Credentials are used for this one request only: never stored, logged or returned.
app.post('/api/connect/shopify', rateLimit({ windowMs: 60_000, limit: 6 }), express.json({ limit: '4kb' }), async (req, res) => {
  const p = z.object({
    shop: z.string().min(3).max(120),
    accessToken: z.string().regex(/^shp[a-z]{2}_[A-Za-z0-9]{16,}$/).optional(),
    clientId: z.string().min(8).max(128).optional(), clientSecret: z.string().min(8).max(256).optional(),
    days: z.number().int().min(7).max(730).default(365), maxOrders: z.number().int().min(10).max(5000).default(2500),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Store address plus an access token (shpat_…) or Client ID + secret are required.' } });
  try {
    const { dataset, orders } = await fetchShopifyDataset(p.data);
    if (dataset.rows.length < 2) return res.status(400).json({ error: { code: 'TOO_FEW_ORDERS', message: `Only ${orders} order(s) found in the last ${p.data.days} days.` } });
    sessions.setDataset(sid(req), dataset, true);
    broadcastTo(sid(req), 'state', { dataset: dataset.name, rows: dataset.rows.length });
    log(`shopify connected: ${orders} orders, ${dataset.rows.length} line items`);
    res.json({ ok: true, name: dataset.name, orders, rows: dataset.rows.length, label: dataset.label });
  } catch (e: any) {
    const code = e instanceof ShopifyError ? e.code : e?.name === 'TimeoutError' ? 'SHOPIFY_TIMEOUT' : 'SHOPIFY_UNREACHABLE';
    log(`shopify connect failed: ${code}`);
    res.status(400).json({ error: { code, message: e instanceof ShopifyError ? e.message : 'Could not reach Shopify. Check the store address.' } });
  }
});

app.post('/api/dataset/sample', (req, res) => { sessions.setDataset(sid(req), generateSampleDataset(), false); broadcastTo(sid(req), 'state', { dataset: 'sample' }); res.json({ ok: true }); });

app.post('/api/dataset/case-study', (req, res) => {
  if (!caseStudyAvailable()) return res.status(404).json({ error: { code: 'NO_CASE_STUDY', message: 'Case study data is not bundled with this server.' } });
  const ds = caseStudy(); // one shared copy for every visitor
  sessions.setDataset(sid(req), ds, false);
  broadcastTo(sid(req), 'state', { dataset: ds.name, rows: ds.rows.length });
  res.json({ ok: true, name: ds.name, rows: ds.rows.length, citation: CASE_STUDY_CITATION });
});

app.post('/api/chat', chatLimit, express.json({ limit: '32kb' }), async (req, res) => {
  const parsed = z.object({ message: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'message (1-2000 chars) is required.' } });
  const screen = screenUserInput(parsed.data.message);
  if (!screen.allowed) { log(`guardrail blocked: ${screen.ids.join(',')}`); return res.json({ blocked: true, reasons: screen.reasons, answer: `Blocked by guardrails: ${screen.reasons.join('; ')}.`, evidence: [], mode: 'guardrail' }); }
  try {
    const ctx = sessions.ctx(sid(req));
    const out = llm.configured ? await claudeChat(llm, ctx, parsed.data.message) : await deterministicAnswer(ctx, parsed.data.message);
    res.json(out);
  } catch (e: any) {
    log(`chat error: ${e?.status ?? ''} ${e?.message ?? e}`);
    const fallback = await deterministicAnswer(sessions.ctx(sid(req)), parsed.data.message);
    res.json({ ...fallback, note: 'AI provider failed; answered in deterministic mode.' });
  }
});

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ extension: bridge.isConnected() })}\n\n`);
  sse.set(res, sid(req));
  const t = setInterval(() => res.write(': keepalive\n\n'), 20_000);
  req.on('close', () => { clearInterval(t); sse.delete(res); });
});

// Single-service production deploy: serve the built web app from the same persistent Node process.
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../../apps/web/dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api|\/bridge).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  log(`unhandled: ${err?.type ?? ''} ${err?.message ?? err}`);
  res.status(err?.status ?? 500).json({ error: { code: err?.type === 'entity.too.large' ? 'TOO_LARGE' : 'INTERNAL', message: err?.type === 'entity.too.large' ? 'Payload too large.' : 'Internal error.' } });
});

const HOST = env.HOST ?? (PROD ? '0.0.0.0' : '127.0.0.1');

/**
 * Production opens on the real-data case study. Everything is loaded and pre-computed BEFORE the
 * port opens, so no visitor ever reaches a server that is still busy warming up (on restart or
 * after the free plan wakes from sleep, the platform holds the request until we're ready).
 */
async function warmUp() {
  if ((env.DEFAULT_DATASET ?? (PROD ? 'case-study' : 'demo')) !== 'case-study' || !caseStudyAvailable()) return;
  const t = Date.now();
  try {
    const ds = caseStudy(); sessions.setDefault(ds); profile(ds); analyzeSmart(ds);
    const ctx = sessions.ctx('default');
    for (const [name, input] of [['build-dashboard', { title: 'Overview' }], ['explain-change', {}], ['test-hypotheses', { useAI: false }], ['recommend-actions', { top: 10 }]] as const) await callTool(ctx, name, input);
    ctx.state.canvas = [];
    log(`case study ready: ${ds.rows.length} rows, caches warm in ${Date.now() - t}ms`);
  } catch (e: any) { log(`case study failed to load: ${e?.message}`); }
}

void warmUp().then(() => server.listen(PORT, HOST, () => {
  log(`Blindspot API on http://${HOST}:${PORT} | tools=${listTools().length} | ai=${llm.configured ? llm.model : 'deterministic'} | bridge ws://${HOST}:${PORT}/bridge${env.BRIDGE_TOKEN ? ' (token required)' : ' (no token, dev only)'}`);
  if (PROD && !env.BRIDGE_TOKEN) log('WARNING: BRIDGE_TOKEN not set in production');
}));
export { app, server, sessions, bridge };
