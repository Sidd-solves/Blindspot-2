import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { BridgeMessage, BRIDGE_VERSION, type BridgeLike, type BridgeMethod } from '@blindspot/tool-contracts';

/** Client side of the bridge for processes outside the browser (MCP server). Reconnects with backoff. */
export class BridgeClient implements BridgeLike {
  private ws: WebSocket | null = null;
  private ready = false;
  private extensionConnected = false;
  private pending = new Map<
    string,
    { resolve: (v: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }
  >();
  private backoff = 500;
  private closed = false;
  private hb?: NodeJS.Timeout;
  private lastPong = Date.now();

  constructor(
    private url: string,
    private token?: string,
    private log: (m: string) => void = () => {},
  ) {
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.on('open', () => {
      this.backoff = 500;
      ws.send(JSON.stringify({ v: BRIDGE_VERSION, kind: 'hello', role: 'client', token: this.token }));
    });
    ws.on('message', (raw) => {
      let m: BridgeMessage;
      try {
        m = BridgeMessage.parse(JSON.parse(raw.toString()));
      } catch {
        return;
      }
      if (m.kind === 'hello-ack') {
        this.ready = true;
        this.extensionConnected = m.extensionConnected;
        this.startHeartbeat();
      } else if (m.kind === 'ping') ws.send(JSON.stringify({ v: BRIDGE_VERSION, kind: 'pong', t: m.t }));
      else if (m.kind === 'pong') this.lastPong = Date.now();
      else if (m.kind === 'response') {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.ok) {
          this.extensionConnected = true;
          p.resolve(m.payload);
        } else {
          if (m.error?.code === 'TABLEAU_NOT_CONNECTED' || m.error?.code === 'EXTENSION_DISCONNECTED')
            this.extensionConnected = false;
          p.reject(Object.assign(new Error(m.error?.message ?? 'Bridge error'), { code: m.error?.code }));
        }
      }
    });
    ws.on('close', (code) => {
      this.ready = false;
      clearInterval(this.hb);
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(Object.assign(new Error('Bridge connection closed'), { code: 'BRIDGE_CLOSED' }));
        this.pending.delete(id);
      }
      if (code === 4003) {
        this.log('bridge: unauthorized (check BRIDGE_TOKEN)');
        this.closed = true;
        return;
      }
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 15_000);
    });
    ws.on('error', () => {}); // close handler drives reconnection
  }

  private startHeartbeat() {
    clearInterval(this.hb);
    this.lastPong = Date.now();
    this.hb = setInterval(() => {
      if (Date.now() - this.lastPong > 45_000) return this.ws?.terminate();
      this.ws?.send(JSON.stringify({ v: BRIDGE_VERSION, kind: 'ping', t: Date.now() }));
    }, 15_000);
  }

  /** True when the hub is reachable; whether the extension is attached is learned from responses. */
  isConnected() {
    return this.ready && this.extensionConnected;
  }
  isReady() {
    return this.ready;
  }

  request<T = unknown>(method: BridgeMethod, payload?: unknown, timeoutMs = 30_000): Promise<T> {
    if (!this.ready || !this.ws)
      return Promise.reject(Object.assign(new Error('Bridge not reachable'), { code: 'BRIDGE_UNAVAILABLE' }));
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error(`No response within ${timeoutMs}ms`), { code: 'TIMEOUT' }));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ v: BRIDGE_VERSION, kind: 'request', id, method, payload }));
    });
  }

  close() {
    this.closed = true;
    clearInterval(this.hb);
    this.ws?.close();
  }
}
