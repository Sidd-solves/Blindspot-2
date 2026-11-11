/**
 * Request bookkeeping for one on-screen question, kept free of React so the timing rules can be tested directly.
 *
 * - Every response is stored with the key (inputs) it was requested for.
 * - Only the newest request may write; anything older that arrives late is dropped.
 * - `view(key)` hides a stored answer whose key isn't the one on screen now, so a render that happens after the inputs
 *   changed but before the new request starts can never show (or let a page cache) the old answer as if it were new.
 */
export interface ReqState<T> {
  key: string | null;
  data: T | null;
  error: string | null;
  loading: boolean;
}
export type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

export const requestKey = (name: string, input: unknown, deps: unknown[]) =>
  JSON.stringify([name, input, deps]);

export class LatestRequest<T> {
  private seq = 0;
  state: ReqState<T> = { key: null, data: null, error: null, loading: false };
  constructor(private onChange: (s: ReqState<T>) => void = () => {}) {}

  private set(s: ReqState<T>) {
    this.state = s;
    this.onChange(s);
  }

  /** Starts a request for `key`; resolves once it has settled (or been superseded). */
  start(key: string, fetcher: () => Promise<Outcome<T>>): Promise<void> {
    const id = ++this.seq;
    this.set({ key, data: null, error: null, loading: true });
    return fetcher().then(
      (r) => {
        if (id !== this.seq) return; // outdated
        this.set(
          r.ok
            ? { key, data: r.data, error: null, loading: false }
            : { key, data: null, error: r.error, loading: false },
        );
      },
      (e: unknown) => {
        if (id !== this.seq) return;
        this.set({
          key,
          data: null,
          error: e instanceof Error ? e.message : 'The request failed.',
          loading: false,
        });
      },
    );
  }

  /** Ignore whatever is still in flight (inputs changed or the page closed). */
  cancel() {
    this.seq++;
  }

  /** What the screen may show for `key` right now. */
  view(key: string): ReqState<T> {
    if (this.state.key !== key) return { key, data: null, error: null, loading: true };
    return this.state;
  }
}
