import type { Server, IncomingMessage } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  BridgeMessage,
  BRIDGE_VERSION,
  MAX_BRIDGE_MESSAGE_BYTES,
  type BridgeLike,
  type BridgeMethod,
} from '@blindspot/tool-contracts';

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timer: NodeJS.Timeout;
  relayTo?: { ws: WebSocket; id: string };
}
type Conn = WebSocket & { role?: 'extension' | 'client'; alive?: boolean };

export interface BridgeOptions {
  token?: string;
  allowedOrigins: string[];
  heartbeatMs?: number;
  log?: (m: string) => void;
}

const safeEq = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * WebSocket hub at /bridge. One Tableau extension connection at a time; any number of
 * authenticated clients (e.g. the MCP server) whose requests are relayed to the extension.
 */
export class BridgeHub implements BridgeLike {
  private wss: WebSocketServer;
  private extension: Conn | null = null;
  private pending = new Map<string, Pending>();
  private listeners = new Set<(e: { name: string; payload: unknown }) => void>();
  private hb: NodeJS.Timeout;
  private log: (m: string) => void;

  constructor(
    server: Server,
    private opts: BridgeOptions,
  ) {
    this.log = opts.log ?? (() => {});
    this.wss = new WebSocketServer({
      server,
      path: '/bridge',
      maxPayload: MAX_BRIDGE_MESSAGE_BYTES,
      verifyClient: (info: { origin: string; req: IncomingMessage }) => this.originOk(info.origin),
    });
    this.wss.on('connection', (ws: Conn) => this.onConnection(ws));
    this.hb = setInterval(() => {
      for (const ws of this.wss.clients as Set<Conn>) {
        if (ws.alive === false) {
          ws.terminate();
          continue;
        }
        ws.alive = false;
        this.send(ws, { v: BRIDGE_VERSION, kind: 'ping', t: Date.now() });
      }
    }, opts.heartbeatMs ?? 15_000);
  }

  private originOk(origin: string | undefined) {
    if (!origin) return true; // non-browser clients (MCP server) send no Origin; they must still pass the token
    return this.opts.allowedOrigins.includes('*') || this.opts.allowedOrigins.includes(origin);
  }

  private send(ws: WebSocket, m: BridgeMessage) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }

  private onConnection(ws: Conn) {
    ws.alive = true;
    const authTimer = setTimeout(() => {
      if (!ws.role) ws.close(4001, 'hello required');
    }, 5000);
    ws.on('message', (raw) => {
      let msg: BridgeMessage;
      try {
        msg = BridgeMessage.parse(JSON.parse(raw.toString()));
      } catch {
        return ws.close(4002, 'invalid message');
      }
      if (msg.kind === 'pong') {
        ws.alive = true;
        return;
      }
      if (msg.kind === 'ping') {
        ws.alive = true;
        return this.send(ws, { v: BRIDGE_VERSION, kind: 'pong', t: msg.t });
      }
      if (!ws.role) {
        if (msg.kind !== 'hello') return ws.close(4001, 'hello required');
        if (this.opts.token && !(msg.token && safeEq(msg.token, this.opts.token)))
          return ws.close(4003, 'unauthorized');
        clearTimeout(authTimer);
        ws.role = msg.role;
        if (msg.role === 'extension') {
          if (this.extension && this.extension !== ws)
            this.extension.close(4004, 'replaced by newer extension');
          this.extension = ws;
          this.emit('extensionStatus', { connected: true });
          this.log('bridge: extension connected');
        }
        return this.send(ws, {
          v: BRIDGE_VERSION,
          kind: 'hello-ack',
          role: msg.role,
          extensionConnected: this.isConnected(),
        });
      }
      if (msg.kind === 'response' && ws.role === 'extension') {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (p.relayTo) return this.send(p.relayTo.ws, { ...msg, id: p.relayTo.id });
        return msg.ok
          ? p.resolve(msg.payload)
          : p.reject(
              Object.assign(new Error(msg.error?.message ?? 'Extension error'), {
                code: msg.error?.code ?? 'EXTENSION_ERROR',
              }),
            );
      }
      if (msg.kind === 'event' && ws.role === 'extension') return this.emit(msg.name, msg.payload);
      if (msg.kind === 'request' && ws.role === 'client')
        return this.relay(ws, msg.id, msg.method, msg.payload);
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (this.extension === ws) {
        this.extension = null;
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          this.pending.delete(id);
          if (p.relayTo)
            this.send(p.relayTo.ws, {
              v: BRIDGE_VERSION,
              kind: 'response',
              id: p.relayTo.id,
              ok: false,
              error: { code: 'EXTENSION_DISCONNECTED', message: 'Extension disconnected' },
            });
          else
            p.reject(Object.assign(new Error('Extension disconnected'), { code: 'EXTENSION_DISCONNECTED' }));
        }
        this.emit('extensionStatus', { connected: false });
        this.log('bridge: extension disconnected');
      }
    });
  }

  private relay(
    client: WebSocket,
    clientId: string,
    method: BridgeMethod,
    payload: unknown,
    timeoutMs = 60_000,
  ) {
    if (!this.extension)
      return this.send(client, {
        v: BRIDGE_VERSION,
        kind: 'response',
        id: clientId,
        ok: false,
        error: { code: 'TABLEAU_NOT_CONNECTED', message: 'No Tableau extension is connected.' },
      });
    const id = randomUUID();
    const timer = setTimeout(() => {
      this.pending.delete(id);
      this.send(client, {
        v: BRIDGE_VERSION,
        kind: 'response',
        id: clientId,
        ok: false,
        error: { code: 'TIMEOUT', message: `No response within ${timeoutMs}ms` },
      });
    }, timeoutMs);
    this.pending.set(id, {
      resolve: () => {},
      reject: () => {},
      timer,
      relayTo: { ws: client, id: clientId },
    });
    this.send(this.extension, { v: BRIDGE_VERSION, kind: 'request', id, method, payload });
  }

  isConnected() {
    return !!this.extension && this.extension.readyState === WebSocket.OPEN;
  }

  request<T = unknown>(method: BridgeMethod, payload?: unknown, timeoutMs = 30_000): Promise<T> {
    if (!this.isConnected())
      return Promise.reject(
        Object.assign(new Error('No Tableau extension is connected.'), { code: 'TABLEAU_NOT_CONNECTED' }),
      );
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error(`No response within ${timeoutMs}ms`), { code: 'TIMEOUT' }));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send(this.extension!, { v: BRIDGE_VERSION, kind: 'request', id, method, payload });
    });
  }

  onEvent(fn: (e: { name: string; payload: unknown }) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(name: string, payload: unknown) {
    for (const l of this.listeners) l({ name, payload });
  }
  close() {
    clearInterval(this.hb);
    this.wss.close();
  }
}
