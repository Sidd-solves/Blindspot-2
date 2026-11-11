import type { ReactNode } from 'react';

export function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: any[]; label?: string; fmt?: (v: number, name: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-2.5 py-1.5 text-[11.5px]" style={{ background: 'var(--panel-solid)' }}>
      {label !== undefined && <div className="mb-0.5 font-extrabold">{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.stroke ?? p.fill }} />
          <span className="text-[var(--muted)]">{p.name}</span>
          <span className="mono ml-auto font-semibold">{fmt ? fmt(p.value, p.name) : p.value}</span>
        </div>
      ))}
    </div>
  );
}
export const axis = { stroke: 'var(--faint)', fontSize: 10.5, tickLine: false, axisLine: false } as const;
/** Call as a function inside a Recharts chart: Recharts drops unknown child components but renders raw <defs>. */
export const glowDefs = (id: string, c: string): ReactNode => (
  <defs>
    <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: c, stopOpacity: 0.45 }} /><stop offset="100%" style={{ stopColor: c, stopOpacity: 0 }} /></linearGradient>
    <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" style={{ stopColor: 'var(--violet)' }} /><stop offset="60%" style={{ stopColor: 'var(--fuchsia)' }} /><stop offset="100%" style={{ stopColor: 'var(--cyan)' }} /></linearGradient>
    <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
  </defs>
);
