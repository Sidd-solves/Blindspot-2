import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { tool } from '../api';

/**
 * Calls a tool with explicit loading / error / success states. A response that arrives after the inputs changed is
 * ignored, so a page never shows an answer to an older question. `retry` runs the same call again.
 */
export function useTool<T = any>(name: string, input: unknown, deps: unknown[], enabled = true) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: enabled,
  });
  const seq = useRef(0);
  const run = useCallback(() => {
    if (!enabled) return;
    const id = ++seq.current;
    setState({ data: null, error: null, loading: true });
    tool<T>(name, input).then((r) => {
      if (id !== seq.current) return; // outdated
      if (r.ok) setState({ data: r.data as T, error: null, loading: false });
      else setState({ data: null, error: r.error?.message ?? 'The analysis failed.', loading: false });
    });
  }, [name, enabled, ...deps]);
  useEffect(() => {
    run();
    return () => {
      seq.current++; // ignore anything still in flight when the inputs change or the page closes
    };
  }, [run]);
  return { ...state, retry: run };
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
