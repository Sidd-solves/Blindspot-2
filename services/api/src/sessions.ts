import type { Dataset } from '@blindspot/analytics';
import { SessionState, type ToolContext } from '@blindspot/tool-contracts';

const SID = /^[A-Za-z0-9_-]{8,64}$/;
export const sidOf = (raw: unknown) => (typeof raw === 'string' && SID.test(raw) ? raw : 'default');

/**
 * One SessionState per visitor, so uploads, filters and connected stores are private.
 * New sessions share the pre-loaded default dataset (same rows array, so analysis caches are shared
 * and memory doesn't grow). Idle sessions expire, and only a few uploaded datasets are kept at once.
 */
export class Sessions {
  private map = new Map<string, { state: SessionState; seen: number; custom: boolean }>();
  constructor(public defaultDataset: Dataset, private base: Omit<ToolContext, 'state'>, private opts = { max: 300, ttlMs: 2 * 3600_000, maxCustom: 6, maxCustomRows: Number(process.env.MAX_CUSTOM_ROWS ?? 220_000) }) {
    setInterval(() => this.sweep(), 10 * 60_000).unref();
  }
  get(sid: string): SessionState {
    let e = this.map.get(sid);
    if (!e) {
      if (this.map.size >= this.opts.max) this.evictOldest(() => true);
      e = { state: new SessionState(this.defaultDataset), seen: Date.now(), custom: false };
      this.map.set(sid, e);
    }
    e.seen = Date.now();
    return e.state;
  }
  ctx(sid: string): ToolContext { return { ...this.base, state: this.get(sid) }; }
  /** Replace a session's dataset. Custom (uploaded/connected) data is capped; the oldest falls back to the default. */
  setDataset(sid: string, ds: Dataset, custom: boolean) {
    const st = this.get(sid), e = this.map.get(sid)!;
    st.setDataset(ds); e.custom = custom;
    const customs = [...this.map.entries()].filter(([, v]) => v.custom).sort((a, b) => a[1].seen - b[1].seen);
    for (const [id, v] of customs.slice(0, Math.max(0, customs.length - this.opts.maxCustom))) if (id !== sid) { v.state.setDataset(this.defaultDataset); v.custom = false; }
    // Memory budget: uploaded rows across all visitors. The oldest other uploads fall back to the default first.
    let total = customs.filter(([, v]) => v.custom).reduce((n, [, v]) => n + v.state.dataset.rows.length, 0);
    for (const [id, v] of customs) {
      if (total <= this.opts.maxCustomRows) break;
      if (id === sid || !v.custom) continue;
      total -= v.state.dataset.rows.length; v.state.setDataset(this.defaultDataset); v.custom = false;
    }
  }
  /** Swap the default (e.g. once the case study loads) for every session still on the old default. */
  setDefault(ds: Dataset) {
    const old = this.defaultDataset; this.defaultDataset = ds;
    for (const v of this.map.values()) if (!v.custom && v.state.dataset === old) v.state.setDataset(ds);
  }
  count() { return { sessions: this.map.size, custom: [...this.map.values()].filter((v) => v.custom).length }; }
  private sweep() { const now = Date.now(); for (const [id, v] of this.map) if (id !== 'default' && now - v.seen > this.opts.ttlMs) this.map.delete(id); }
  private evictOldest(pred: (id: string) => boolean) { let oldest: string | null = null, t = Infinity; for (const [id, v] of this.map) if (id !== 'default' && pred(id) && v.seen < t) { t = v.seen; oldest = id; } if (oldest) this.map.delete(oldest); }
}
