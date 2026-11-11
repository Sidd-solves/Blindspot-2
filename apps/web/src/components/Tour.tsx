import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import { post } from '../api';
import { useStore } from '../store';

/**
 * A guided tour of the best moments, for anyone short on time (judges first). Each step opens a page, finds a
 * card by its visible title, spotlights it and explains it in one or two sentences. Steps whose card isn't on the
 * page (e.g. a file without products has no stock-outs) are skipped, so the tour works on any data.
 */
type Step = {
  page: string;
  /** Visible text of a heading or button inside the element to spotlight. */
  find: string;
  /** Spotlight the nearest panel around the text (default) or the element itself. */
  box?: 'panel' | 'self' | 'parent';
  title: string;
  body: string;
  /** Runs after the page opens, before looking for the target (e.g. click into a drill-down). */
  before?: () => void;
};

const byText = (text: string): HTMLElement | null => {
  const all = document.querySelectorAll<HTMLElement>(
    'main h3, main button, main .label, main span, main div',
  );
  for (const el of all) if (el.childElementCount <= 3 && el.textContent?.trim() === text) return el;
  return null;
};

const STEPS: Step[] = [
  {
    page: 'overview',
    find: 'Fix this first',
    box: 'parent',
    title: 'One problem to fix first',
    body: 'Every problem is ranked by the money involved. This is the biggest one, and every finding says how strong its evidence is.',
  },
  {
    page: 'risk',
    find: 'See the affected rows',
    box: 'self',
    title: 'Every number can be checked',
    body: 'Each finding stores exactly how it was calculated. This button replays it on the raw rows.',
  },
  {
    page: 'risk',
    before: () => byText('See the affected rows')?.click(),
    find: 'Replay',
    title: 'Rows that add up, to the penny',
    body: 'The rows behind the finding are added up in whole pennies and compared with the finding. They match exactly.',
  },
  {
    page: 'forecast',
    find: 'Track record',
    title: 'A forecast with a track record',
    body: 'Before forecasting, it replays itself on past months using only the data it had then, and shows how far off it was.',
  },
  {
    page: 'customers',
    find: 'Did the warning work before?',
    title: 'Customers worth checking on',
    body: 'The warning was replayed 90 days back: customers it flagged stayed away almost twice as often as the rest, so it shows who to check on first.',
  },
  {
    page: 'stock',
    find: 'Products that went silent, then sold again',
    title: 'Unusual gaps in sales',
    body: 'Products that suddenly stopped getting orders, then came back. Possible stock-outs: the gap is tested, but the cause needs checking.',
  },
  {
    page: 'prove',
    find: 'Fact-check a claim',
    title: 'Check any belief',
    body: 'Build a sentence like “average order is higher in Germany” and see whether your data supports it, from a real statistical test.',
  },
  {
    page: 'analyst',
    find: 'What will sales be next month?',
    box: 'self',
    title: 'Ask in plain English',
    body: 'Claude answers using 21 read-only tools. The calculations come from the analysis engine, not the model, and every answer lists the tools behind its numbers.',
  },
  {
    page: 'reports',
    find: 'Your roadmap',
    title: 'A plan, not just charts',
    body: 'Everything ends in a one-page report and a 30, 90 and 180-day roadmap you can send to a partner.',
  },
];

export function startTour() {
  window.dispatchEvent(new Event('blindspot:tour'));
}

export function Tour() {
  const { dataset, refresh } = useStore();
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const target = useRef<HTMLElement | null>(null);
  const dir = useRef(1);

  useEffect(() => {
    const go = async () => {
      // The tour is written for real data: use the UK shop unless the visitor brought their own file.
      if (dataset && dataset.source === 'sample') {
        await post('/api/dataset/case-study', {}).catch(() => null);
        await refresh();
      }
      dir.current = 1;
      setI(0);
    };
    window.addEventListener('blindspot:tour', go);
    return () => window.removeEventListener('blindspot:tour', go);
  }, [dataset, refresh]);

  // Opened from the home page's "60-second tour" button: start once, after the page settles.
  useEffect(() => {
    if (!location.hash.includes('tour=1')) return;
    const t = setTimeout(startTour, 800);
    return () => clearTimeout(t);
  }, []);

  const close = useCallback(() => {
    setI(null);
    setRect(null);
    target.current = null;
  }, []);

  // Open the page, find the target, follow it while the page scrolls or animates.
  useEffect(() => {
    if (i === null) return;
    if (i < 0 || i >= STEPS.length) return close();
    const s = STEPS[i];
    let alive = true,
      raf = 0;
    setRect(null);
    setMissing(false);
    target.current = null;
    if (!location.hash.startsWith(`#/${s.page}`)) location.hash = `/${s.page}`;
    const started = Date.now();
    let prepared = !s.before;
    const look = () => {
      if (!alive) return;
      if (!prepared && Date.now() - started > 900) {
        s.before?.();
        prepared = true;
      }
      const hit = prepared ? byText(s.find) : null;
      const el =
        hit &&
        (s.box === 'self'
          ? (hit.closest('button') ?? hit)
          : s.box === 'parent'
            ? (hit.parentElement ?? hit)
            : (hit.closest<HTMLElement>('.panel') ?? hit));
      if (el) {
        target.current = el as HTMLElement;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const follow = () => {
          if (!alive || !target.current) return;
          setRect(target.current.getBoundingClientRect());
          raf = requestAnimationFrame(follow);
        };
        setTimeout(follow, 250);
        return;
      }
      if (Date.now() - started > 9000) {
        // Not on this data: skip ahead in the direction the visitor was going.
        setMissing(true);
        setI((x) => (x === null ? null : x + dir.current));
        return;
      }
      setTimeout(look, 200);
    };
    setTimeout(look, 300);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [i, close]);

  useEffect(() => {
    if (i === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') {
        dir.current = 1;
        setI((x) => (x === null ? x : x + 1));
      }
      if (e.key === 'ArrowLeft') {
        dir.current = -1;
        setI((x) => (x === null || x === 0 ? x : x - 1));
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [i, close]);

  if (i === null || i >= STEPS.length) return null;
  const s = STEPS[i];
  const pad = 8;
  const vw = window.innerWidth,
    vh = window.innerHeight;
  // Card below the target if there's room, else above; kept on screen.
  const cardW = Math.min(340, vw - 24);
  const below = rect ? rect.bottom + 180 < vh : true;
  const cardTop = rect
    ? below
      ? rect.bottom + pad + 10
      : Math.max(12, rect.top - pad - 10 - 170)
    : vh / 2 - 80;
  const cardLeft = rect
    ? Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 12)
    : vw / 2 - cardW / 2;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Dim everything except the spotlight */}
      <motion.div
        className="absolute rounded-xl"
        initial={false}
        animate={
          rect
            ? {
                left: rect.left - pad,
                top: rect.top - pad,
                width: rect.width + pad * 2,
                height: rect.height + pad * 2,
                opacity: 1,
              }
            : { left: vw / 2, top: vh / 2, width: 0, height: 0, opacity: 1 }
        }
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        style={{
          boxShadow:
            '0 0 0 9999px rgba(4, 6, 18, 0.62), 0 0 0 2px var(--cyan), 0 0 28px 4px color-mix(in srgb, var(--cyan) 55%, transparent)',
          pointerEvents: 'none',
        }}
      />
      <div className="absolute inset-0" onClick={close} aria-hidden />
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: below ? 10 : -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          className="panel absolute p-3.5"
          style={{ top: cardTop, left: cardLeft, width: cardW, background: 'var(--panel-solid)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--cyan)' }}
            >
              <Compass size={12} />
              Tour · {i + 1} of {STEPS.length}
            </span>
            <button
              onClick={close}
              className="text-[var(--muted)] hover:text-[var(--text)]"
              aria-label="End tour"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-1 text-[14px] font-extrabold">{s.title}</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-[var(--muted)]">
            {rect ? s.body : missing ? 'Skipping a step this data can’t show…' : 'Opening the page…'}
          </div>
          <div className="mt-2.5 h-1 rounded-full bg-[var(--line)]">
            <motion.div
              className="h-1 rounded-full"
              style={{ background: 'linear-gradient(90deg, var(--violet), var(--cyan))' }}
              animate={{ width: `${((i + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <button
              className="btn !h-7 text-[11.5px]"
              disabled={i === 0}
              onClick={() => {
                dir.current = -1;
                setI(i - 1);
              }}
            >
              <ArrowLeft size={12} />
              Back
            </button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="btn btn-primary !h-7 text-[11.5px]"
              onClick={() => {
                dir.current = 1;
                if (i === STEPS.length - 1) close();
                else setI(i + 1);
              }}
            >
              {i === STEPS.length - 1 ? 'Finish' : 'Next'}
              <ArrowRight size={12} />
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
