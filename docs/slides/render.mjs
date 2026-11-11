import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(process.env.PNG ?? 'png', { recursive: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9334', '--user-data-dir=/tmp/deck-profile', '--allow-file-access-from-files', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
await sleep(2500);
const t = (await (await fetch('http://127.0.0.1:9334/json')).json()).find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await cmd('Page.navigate', { url: 'file://' + process.cwd() + '/' + (process.env.DECK ?? 'deck.html') });
for (let i = 0; i < 40 && !(await js("document.body && document.body.dataset.ready === '1'")); i++) await sleep(500);
await sleep(2500);
const n = await js("document.querySelectorAll('.slide').length");
const missing = await js("[...document.querySelectorAll('i[data-lucide]')].map(e=>e.dataset.lucide)");
console.log('slides', n, 'unrendered icons', missing);
const scale = Number(process.argv[2] ?? 1);
for (let k = 0; k < n; k++) {
  const r = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: k * 1080, width: 1920, height: 1080, scale } });
  writeFileSync(`${process.env.PNG ?? 'png'}/slide-${String(k + 1).padStart(2, '0')}.png`, Buffer.from(r.result.data, 'base64'));
}
const pdf = await cmd('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
writeFileSync(process.env.OUT ?? 'Blindspot_deck.pdf', Buffer.from(pdf.result.data, 'base64'));
console.log('done'); ws.close(); chrome.kill();
