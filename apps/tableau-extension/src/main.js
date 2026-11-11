/* global tableau */
// Blindspot Tableau dashboard extension: answers bridge requests using documented Extensions API calls only.
const params = new URLSearchParams(location.search);
const BRIDGE_URL = params.get('bridge') ?? 'ws://127.0.0.1:8787/bridge';
const TOKEN = params.get('token') ?? undefined;
const V = 1;

const logEl = document.getElementById('log');
function log(msg, cls = '') {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<span class="t">${new Date().toLocaleTimeString()}</span><span class="${cls}"></span>`;
  row.lastChild.textContent = msg; // never inject HTML from data
  logEl.prepend(row);
  while (logEl.children.length > 80) logEl.lastChild.remove();
}
function status(text, c) { document.getElementById('status-text').textContent = text; document.getElementById('status').style.setProperty('--c', c); }

let dashboard;
const ws = () => dashboard.worksheets;
function worksheet(name) {
  const w = ws().find((x) => x.name === name);
  if (!w) throw Object.assign(new Error(`Worksheet "${name}" not found. Available: ${ws().map((x) => x.name).join(', ')}`), { code: 'WORKSHEET_NOT_FOUND' });
  return w;
}
function tableToRows(table, rows, limit) {
  const cols = table.columns.map((c) => ({ name: c.fieldName, dataType: c.dataType, index: c.index }));
  for (const r of table.data) {
    if (rows.length >= limit) break;
    const o = {};
    for (const c of cols) { const v = r[c.index]; o[c.name] = v.value === null || v.value === undefined || v.value === '%null%' ? null : v.value; }
    rows.push(o);
  }
  return cols.map(({ name, dataType }) => ({ name, dataType }));
}

const handlers = {
  async ping() { return { pong: true, dashboard: dashboard.name }; },
  async listWorksheets() { return { worksheets: ws().map((w) => w.name) }; },
  async getWorksheetData({ worksheet: name, maxRows = 50000, ignoreSelection = true }) {
    const w = worksheet(name);
    const rows = [];
    let columns = [];
    let truncated = false;
    if (typeof w.getSummaryDataReaderAsync === 'function') {
      // Paged reader (Extensions API 1.10+): avoids loading everything at once.
      const reader = await w.getSummaryDataReaderAsync(10000, { ignoreSelection });
      try {
        for (let p = 0; p < reader.pageCount && rows.length < maxRows; p++) columns = tableToRows(await reader.getPageAsync(p), rows, maxRows);
        truncated = reader.totalRowCount > rows.length;
      } finally { await reader.releaseAsync(); }
    } else {
      const table = await w.getSummaryDataAsync({ ignoreSelection, maxRows });
      columns = tableToRows(table, rows, maxRows);
      truncated = table.isTotalRowCountLimited ?? false;
    }
    return { columns, rows, truncated };
  },
  async getFilters({ worksheet: name }) {
    const filters = await worksheet(name).getFiltersAsync();
    return { filters: filters.map((f) => ({ fieldName: f.fieldName, filterType: f.filterType, appliedValues: f.appliedValues?.map((v) => v.formattedValue) })) };
  },
  async applyFilter({ worksheet: name, field, values = [], mode = 'replace' }) {
    const w = worksheet(name);
    if (mode === 'clear') { await w.clearFilterAsync(field); return { field, cleared: true }; }
    const type = { replace: tableau.FilterUpdateType.Replace, add: tableau.FilterUpdateType.Add, remove: tableau.FilterUpdateType.Remove }[mode];
    await w.applyFilterAsync(field, values, type);
    return { field, values, mode };
  },
  async getParameters() {
    const ps = await dashboard.getParametersAsync();
    return { parameters: ps.map((p) => ({ name: p.name, value: p.currentValue.value, dataType: p.dataType })) };
  },
  async setParameter({ parameter, value }) {
    const p = await dashboard.findParameterAsync(parameter);
    if (!p) throw Object.assign(new Error(`Parameter "${parameter}" not found`), { code: 'PARAMETER_NOT_FOUND' });
    const updated = await p.changeValueAsync(value);
    return { parameter, value: updated?.value ?? value };
  },
};

let socket, backoff = 500;
function send(m) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ v: V, ...m })); }
function connect() {
  status('Connecting', 'var(--amber)');
  socket = new WebSocket(BRIDGE_URL);
  socket.onopen = () => { backoff = 500; send({ kind: 'hello', role: 'extension', token: TOKEN }); };
  socket.onmessage = async (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.kind === 'hello-ack') { status('Connected', 'var(--emerald)'); log(`Connected to ${BRIDGE_URL}`, 'ok'); return; }
    if (m.kind === 'ping') return send({ kind: 'pong', t: m.t });
    if (m.kind !== 'request') return;
    const h = handlers[m.method];
    const t0 = performance.now();
    try {
      if (!h) throw Object.assign(new Error(`Unsupported method ${m.method}`), { code: 'UNSUPPORTED' });
      const payload = await h(m.payload ?? {});
      send({ kind: 'response', id: m.id, ok: true, payload });
      log(`${m.method} ok (${Math.round(performance.now() - t0)}ms)`, 'ok');
    } catch (e) {
      send({ kind: 'response', id: m.id, ok: false, error: { code: String(e.code ?? 'EXTENSION_ERROR').slice(0, 64), message: String(e.message ?? e).slice(0, 480) } });
      log(`${m.method} failed: ${e.message}`, 'err');
    }
  };
  socket.onclose = (e) => {
    status(e.code === 4003 ? 'Unauthorized' : 'Reconnecting', 'var(--rose)');
    if (e.code === 4003) return log('Bridge rejected the token. Add ?token=… to the extension URL.', 'err');
    setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 15000);
  };
}

function watchEvents() {
  for (const w of ws()) w.addEventListener(tableau.TableauEventType.FilterChanged, (e) => { send({ kind: 'event', name: 'filterChanged', payload: { worksheet: w.name, field: e.fieldName } }); log(`filter changed on ${w.name}: ${e.fieldName}`); });
  dashboard.getParametersAsync().then((ps) => ps.forEach((p) => p.addEventListener(tableau.TableauEventType.ParameterChanged, () => { send({ kind: 'event', name: 'parameterChanged', payload: { parameter: p.name } }); log(`parameter changed: ${p.name}`); })));
}

if (typeof tableau === 'undefined' || !tableau.extensions) {
  status('Open inside Tableau', 'var(--amber)');
  log('The Extensions API is only available when this page runs as a Tableau dashboard extension (.trex).', 'err');
} else {
  tableau.extensions.initializeAsync().then(() => {
    dashboard = tableau.extensions.dashboardContent.dashboard;
    log(`Dashboard "${dashboard.name}" with ${ws().length} worksheet(s)`);
    watchEvents();
    connect();
  }, (err) => { status('Init failed', 'var(--rose)'); log(`initializeAsync failed: ${err.message}`, 'err'); });
}
