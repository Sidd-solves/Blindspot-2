import { motion, AnimatePresence, useInView, animate } from 'framer-motion';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';

export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
export const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } } };

export function Card({ children, className = '', style, c, hover = true, onClick, delay }: { children: ReactNode; className?: string; style?: CSSProperties; c?: string; hover?: boolean; onClick?: () => void; delay?: number }) {
  return (
    <motion.div variants={fadeUp} initial={delay !== undefined ? 'hidden' : undefined} animate={delay !== undefined ? 'show' : undefined} transition={delay ? { delay } : undefined}
      whileHover={hover ? { y: -2, transition: { duration: 0.15 } } : undefined} onClick={onClick}
      className={`panel relative overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`} style={{ ...(c ? ({ '--c': c } as CSSProperties) : {}), ...style }}>
      {c && <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-25 blur-2xl" style={{ background: c }} />}
      {children}
    </motion.div>
  );
}

export function CardHead({ icon, title, c, right }: { icon?: ReactNode; title: string; c?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="grid h-6 w-6 flex-none place-items-center rounded-md" style={{ color: c, background: `color-mix(in srgb, ${c} 15%, transparent)` }}>{icon}</span>}
        <h3 className="truncate text-[12.5px] font-extrabold tracking-tight">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString(), duration = 1.1, className = '' }: { value: number; format?: (n: number) => string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0), shown = useRef(0);
  useEffect(() => {
    const ctl = animate(prev.current, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => { shown.current = v; if (ref.current) ref.current.textContent = format(v); } });
    prev.current = value;
    return () => ctl.stop();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  // Re-renders (e.g. a currency switch changes `format`) must show the current number, not reset to 0.
  return <span ref={ref} className={`mono ${className}`}>{format(shown.current)}</span>;
}

export function Ring({ value, size = 76, stroke = 7, c = 'var(--violet)', children }: { value: number; size?: number; stroke?: number; c?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, id = useId();
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: c }} /><stop offset="1" style={{ stopColor: 'var(--cyan)' }} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line-strong)" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * (1 - Math.max(0, Math.min(1, value))) }} transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 5px ${c})` }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Sparkline({ data, c = 'var(--violet)', w = 90, h = 26 }: { data: number[]; c?: string; w?: number; h?: number }) {
  const id = useId();
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data), sx = w / (data.length - 1), sy = (v: number) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${(i * sx).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: c, stopOpacity: 0.35 }} /><stop offset="1" style={{ stopColor: c, stopOpacity: 0 }} /></linearGradient></defs>
      <motion.path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} />
      <motion.path d={d} fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} style={{ filter: `drop-shadow(0 0 3px ${c})` }} />
    </svg>
  );
}

export function Meter({ value, c = 'var(--violet)', h = 5 }: { value: number; c?: string; h?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height: h, background: 'var(--line-strong)' }}>
      <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${c}, color-mix(in srgb, ${c} 50%, var(--cyan)))`, boxShadow: `0 0 8px ${c}` }} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  );
}

export const Chip = ({ c, children, pulse }: { c: string; children: ReactNode; pulse?: boolean }) => (
  <span className="chip" style={{ '--c': c } as CSSProperties}>{pulse && <span className="pulse-dot" style={{ '--c': c, width: 5, height: 5 } as CSSProperties} />}{children}</span>
);

export function Loading({ steps, className = '' }: { steps: string[]; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % steps.length), 900); return () => clearInterval(t); }, [steps.length]);
  return (
    <div className={`flex items-center gap-2 text-[12px] text-[var(--muted)] ${className}`}>
      <Loader2 size={14} className="spin" style={{ color: 'var(--violet)' }} />
      <AnimatePresence mode="wait"><motion.span key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>{steps[i]}</motion.span></AnimatePresence>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, layoutId }: { tabs: { id: T; label: string; c?: string; count?: number }[]; value: T; onChange: (v: T) => void; layoutId: string }) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className="relative flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[12px] font-bold transition-colors" style={{ color: value === t.id ? 'var(--text)' : 'var(--muted)' }}>
          {t.c && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.c }} />}
          {t.label}{t.count !== undefined && <span className="mono text-[10px] text-[var(--faint)]">{t.count}</span>}
          {value === t.id && <motion.span layoutId={layoutId} className="absolute inset-x-1 -bottom-px h-[2px] rounded-full" style={{ background: `linear-gradient(90deg, ${t.c ?? 'var(--violet)'}, var(--cyan))`, boxShadow: `0 0 8px ${t.c ?? 'var(--violet)'}` }} transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
        </button>
      ))}
    </div>
  );
}

export function Dropdown({ value, options, onChange, placeholder = 'Select...', multi = false, width = 150, c = 'var(--violet)' }: { value: string[]; options: string[]; onChange: (v: string[]) => void; placeholder?: string; multi?: boolean; width?: number | string; c?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const label = value.length === 0 ? placeholder : value.length === 1 ? value[0] : `${value[0]} +${value.length - 1}`;
  return (
    <div ref={ref} className="relative" style={{ width }}>
      <button onClick={() => setOpen((o) => !o)} className="input flex w-full items-center justify-between gap-1 text-left" style={{ color: value.length ? 'var(--text)' : 'var(--faint)', borderColor: value.length ? c : undefined }}>
        <span className="truncate">{label}</span><ChevronDown size={13} className="flex-none transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.14 }}
            className="panel absolute left-0 z-50 mt-1 max-h-60 min-w-full overflow-y-auto p-1" style={{ background: 'var(--panel-solid)' }}>
            {value.length > 0 && <button onClick={() => { onChange([]); setOpen(false); }} className="row-hover w-full rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--faint)]">Clear</button>}
            {options.map((o) => {
              const on = value.includes(o);
              return (
                <button key={o} onClick={() => { const next = multi ? (on ? value.filter((v) => v !== o) : [...value, o]) : [o]; onChange(next); if (!multi) setOpen(false); }}
                  className="row-hover flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[12px] font-semibold">
                  <span className="truncate">{o}</span>{on && <Check size={13} style={{ color: c }} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  return <motion.div ref={ref} className={className} initial={{ opacity: 0, y: 18 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ type: 'spring', stiffness: 200, damping: 26 }}>{children}</motion.div>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <motion.div animate={{ y: [0, -5, 0], rotate: [0, -4, 4, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} className="grid h-11 w-11 place-items-center rounded-xl tint" style={{ '--c': 'var(--violet)', color: 'var(--violet)' } as CSSProperties}>{icon}</motion.div>
      <div className="text-[12.5px] font-extrabold">{title}</div>
      {children && <div className="max-w-xs text-[11.5px] text-[var(--muted)]">{children}</div>}
    </div>
  );
}

/** Tiny safe Markdown renderer (headings, bold, lists, quotes). No HTML passthrough. */
export function Markdown({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [], ordered = false;
  const flush = () => { if (list.length) { blocks.push(ordered ? <ol key={blocks.length}>{list}</ol> : <ul key={blocks.length}>{list}</ul>); list = []; } };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (/^[-*] /.test(t)) { if (ordered) flush(); ordered = false; list.push(<li key={list.length}>{inline(t.slice(2))}</li>); continue; }
    if (/^\d+\. /.test(t)) { if (!ordered) flush(); ordered = true; list.push(<li key={list.length}>{inline(t.replace(/^\d+\. /, ''))}</li>); continue; }
    flush();
    if (!t) continue;
    if (t.startsWith('# ')) blocks.push(<h1 key={blocks.length}>{inline(t.slice(2))}</h1>);
    else if (t.startsWith('## ')) blocks.push(<h2 key={blocks.length}>{inline(t.slice(3))}</h2>);
    else if (t.startsWith('> ')) blocks.push(<blockquote key={blocks.length}>{inline(t.slice(2))}</blockquote>);
    else if (t.startsWith('|')) continue;
    else blocks.push(<p key={blocks.length} className="my-1">{inline(t)}</p>);
  }
  flush();
  return <div className="md">{blocks}</div>;
}
