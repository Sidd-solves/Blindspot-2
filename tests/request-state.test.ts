import { describe, expect, it } from 'vitest';
import { LatestRequest, requestKey, type Outcome } from '../apps/web/src/components/latestRequest';

/** A request whose answer we release by hand, to replay any arrival order. */
function deferred<T>() {
  let resolve!: (o: Outcome<T>) => void;
  const promise = new Promise<Outcome<T>>((r) => (resolve = r));
  return { promise, resolve };
}

describe('on-screen request state (dataset switches, late answers, retries)', () => {
  const k1 = requestKey('win-back-list', { shopName: 'our shop' }, [1]),
    k2 = requestKey('win-back-list', { shopName: 'our shop' }, [2]);

  it('an answer for the old dataset that arrives after the switch is dropped', async () => {
    const r = new LatestRequest<string>();
    const old = deferred<string>(),
      fresh = deferred<string>();
    const a = r.start(k1, () => old.promise);
    const b = r.start(k2, () => fresh.promise); // dataset switched
    fresh.resolve({ ok: true, data: 'new list' });
    await b;
    old.resolve({ ok: true, data: 'old list' }); // arrives late
    await a;
    expect(r.view(k2).data).toBe('new list');
  });

  it('between "inputs changed" and "new request sent", the old answer is not shown as the new one', async () => {
    const r = new LatestRequest<string>();
    await r.start(k1, async () => ({ ok: true, data: 'old list' }));
    // The page has re-rendered for dataset 2, but the effect that starts the new request hasn't run yet.
    const v = r.view(k2);
    expect(v.data).toBeNull();
    expect(v.loading).toBe(true);
    expect(v.key).toBe(k2);
    // And on dataset 1 it is still shown.
    expect(r.view(k1).data).toBe('old list');
  });

  it('a new early-warning answer arriving before the new win-back answer never pairs with the old win-back list', async () => {
    const ew = new LatestRequest<string>(),
      wb = new LatestRequest<string>();
    const ek1 = requestKey('early-warning', { top: 200 }, [1]),
      ek2 = requestKey('early-warning', { top: 200 }, [2]);
    await ew.start(ek1, async () => ({ ok: true, data: 'ew v1' }));
    await wb.start(k1, async () => ({ ok: true, data: 'wb v1' }));
    const wbNew = deferred<string>();
    const pending = wb.start(k2, () => wbNew.promise);
    await ew.start(ek2, async () => ({ ok: true, data: 'ew v2' })); // early warning wins the race
    // What the page would render now: new early warning, and no win-back list yet (loading), never "wb v1".
    expect(ew.view(ek2).data).toBe('ew v2');
    expect(wb.view(k2).data).toBeNull();
    wbNew.resolve({ ok: true, data: 'wb v2' });
    await pending;
    expect(wb.view(k2).data).toBe('wb v2');
  });

  it('a failed request shows the error, and a retry that succeeds replaces it', async () => {
    const r = new LatestRequest<string>();
    await r.start(k1, async () => ({ ok: false, error: 'Server busy' }));
    expect(r.view(k1)).toMatchObject({ data: null, error: 'Server busy', loading: false });
    await r.start(k1, async () => ({ ok: true, data: 'list' }));
    expect(r.view(k1)).toMatchObject({ data: 'list', error: null, loading: false });
  });

  it('a request that throws becomes an error, not an endless spinner', async () => {
    const r = new LatestRequest<string>();
    await r.start(k1, () => Promise.reject(new Error('Network down')));
    expect(r.view(k1)).toMatchObject({ error: 'Network down', loading: false });
  });

  it('closing the page drops answers still in flight', async () => {
    const r = new LatestRequest<string>();
    const d = deferred<string>();
    const p = r.start(k1, () => d.promise);
    r.cancel();
    d.resolve({ ok: true, data: 'late' });
    await p;
    expect(r.view(k1).data).toBeNull();
  });
});
