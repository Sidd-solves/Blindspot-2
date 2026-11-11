/**
 * Render's free plan puts a server to sleep after 15 minutes without inbound requests, and the next visitor waits on a
 * "Welcome to Render" screen. Render tells the server its own public URL (RENDER_EXTERNAL_URL); requesting it every
 * 10 minutes goes out through Render's proxy and back in, so the service never sits idle long enough to sleep.
 */
export function keepAwake(log: (message: string) => void) {
  const base = process.env.KEEP_AWAKE_URL ?? process.env.RENDER_EXTERNAL_URL;
  if (!base) return;
  const url = `${base.replace(/\/$/, '')}/api/health?keepawake=1`;
  const ping = () =>
    fetch(url, { signal: AbortSignal.timeout(30_000) })
      .then((r) => {
        if (!r.ok) log(`keep-awake: HTTP ${r.status}`);
      })
      .catch((e) => log(`keep-awake failed: ${e?.message}`));
  setInterval(ping, 10 * 60_000).unref();
  setTimeout(ping, 60_000).unref();
  log(`keep-awake: pinging ${url} every 10 minutes`);
}
