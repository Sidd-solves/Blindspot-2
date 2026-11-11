import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Coins, Search } from 'lucide-react';
import { useStore } from '../store';

const POPULAR = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'];

/** Searchable currency switcher: every amount in the app is shown in the picked currency. */
export function CurrencyPicker() {
  const { fx, setDisplayCurrency, loading } = useStore();
  const [open, setOpen] = useState(false), [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  useEffect(() => { if (open) { setQ(''); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  if (!fx) return null;
  const codes = Object.keys(fx.rates).filter((c) => fx.names[c]);
  const ordered = [...POPULAR.filter((c) => codes.includes(c)), ...codes.filter((c) => !POPULAR.includes(c)).sort()];
  const needle = q.trim().toLowerCase();
  const list = needle ? ordered.filter((c) => c.toLowerCase().includes(needle) || fx.names[c].toLowerCase().includes(needle)) : ordered;
  const pick = (c: string) => { setOpen(false); if (c !== fx.to) setDisplayCurrency(c); };
  const converted = fx.to !== fx.base;
  const rate = (c: string) => { const r = fx.rates[c]; return r >= 100 ? r.toFixed(0) : r >= 1 ? r.toFixed(2) : r.toFixed(4); };
  return (
    <div ref={ref} className="relative">
      <motion.button whileTap={{ scale: 0.96 }} onClick={() => setOpen((o) => !o)} disabled={loading} className="input flex h-7 items-center gap-1.5 !px-2 text-[11.5px] font-bold" style={{ borderColor: converted ? 'var(--amber)' : undefined }} title="Show amounts in another currency">
        <Coins size={13} style={{ color: 'var(--amber)' }} />
        <span className="mono">{fx.to}</span>
        {converted && <span className="hidden text-[10px] font-semibold text-[var(--faint)] sm:inline">from {fx.base}</span>}
        <ChevronDown size={12} className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.14 }}
            className="panel absolute right-0 z-50 mt-1 w-[260px] p-1.5" style={{ background: 'var(--panel-solid)' }}>
            <div className="relative mb-1">
              <Search size={12} className="absolute left-2 top-[9px] text-[var(--faint)]" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) pick(list[0]); if (e.key === 'Escape') setOpen(false); }} placeholder="Search currency…" className="input h-8 w-full !pl-7 text-[12px]" />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {list.map((c, i) => {
                const on = c === fx.to;
                return (
                  <motion.button key={c} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.015 }} onClick={() => pick(c)}
                    className="row-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]">
                    <span className="mono w-9 flex-none font-bold" style={{ color: on ? 'var(--amber)' : 'var(--text)' }}>{c}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{fx.names[c]}{c === fx.base && <span className="ml-1 text-[10px] font-bold text-[var(--emerald)]">original</span>}</span>
                    {c !== fx.base && <span className="mono text-[10px] text-[var(--faint)]">{rate(c)}</span>}
                    {on && <Check size={13} style={{ color: 'var(--amber)' }} />}
                  </motion.button>
                );
              })}
              {!list.length && <div className="px-2 py-3 text-center text-[11.5px] text-[var(--faint)]">No currency matches "{q}"</div>}
            </div>
            <div className="mt-1 border-t px-2 pt-1.5 text-[10px] text-[var(--faint)]" style={{ borderColor: 'var(--line)' }}>
              {fx.live ? `Today's rate (${fx.date}, European Central Bank). ` : 'Approximate rate (live rates unavailable). '}Your data is in {fx.base}; every amount is converted at this rate.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
