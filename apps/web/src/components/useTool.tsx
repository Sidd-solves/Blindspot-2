import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { tool } from '../api';
import { LatestRequest, requestKey } from './latestRequest';

/**
 * Calls a tool with explicit loading / error / success states. Each answer is stored with the inputs it was asked
 * for, and only shown while those are still the inputs on screen: a late answer to an older question is dropped, and
 * a render between "inputs changed" and "new request sent" shows loading, never the old answer. `key` names the
 * inputs the returned `data` belongs to. `retry` runs the same call again.
 */
export function useTool<T = any>(name: string, input: unknown, deps: unknown[], enabled = true) {
  const key = requestKey(name, enabled ? input : null, [enabled, ...deps]);
  const [, rerender] = useState(0);
  const req = useRef<LatestRequest<T> | null>(null);
  if (!req.current) req.current = new LatestRequest<T>(() => rerender((n) => n + 1));
  const run = useCallback(() => {
    if (!enabled) return;
    void req.current!.start(key, () =>
      tool<T>(name, input).then((r) =>
        r.ok
          ? { ok: true as const, data: r.data as T }
          : { ok: false as const, error: r.error?.message ?? 'The analysis failed.' },
      ),
    );
  }, [key]);
  useEffect(() => {
    run();
    return () => req.current!.cancel();
  }, [run]);
  const s = enabled ? req.current.view(key) : { key, data: null, error: null, loading: false };
  return { data: s.data, error: s.error, loading: s.loading, key, retry: run };
}

/** A failed analysis, with what went wrong and a way to try again. */
export function ToolError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="panel flex flex-wrap items-center gap-3 p-4 text-[12.5px]"
      style={{ borderColor: 'color-mix(in srgb, var(--rose) 45%, var(--line))' }}
    >
      <TriangleAlert size={16} style={{ color: 'var(--rose)' }} />
      <span className="min-w-0 flex-1">
        <b>That didn’t load.</b> <span className="text-[var(--muted)]">{message}</span>
      </span>
      <motion.button whileTap={{ scale: 0.95 }} onClick={retry} className="btn !h-8 text-[12px]">
        <RotateCcw size={13} />
        Try again
      </motion.button>
    </motion.div>
  );
}
