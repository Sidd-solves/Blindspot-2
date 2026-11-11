import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { KineticTitle } from './Scroll';

export interface HeroChip {
  icon: ReactNode;
  value: string;
  label: string;
  c: string;
  /** Where it floats, in % of the hero, and how far it moves with the mouse (depth). */
  x: number;
  y: number;
  depth: number;
}

/**
 * The opening of each site page: a headline that rises word by word, a short line under it, and glass chips with
 * real figures that float at different depths and drift with the mouse. Scrolling lifts the whole hero away.
 */
export function PageHero({
  label,
  color,
  lines,
  sub,
  chips,
  children,
}: {
  label: string;
  color: string;
  lines: ReactNode[][];
  sub?: ReactNode;
  chips: HeroChip[];
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const mx = useMotionValue(0),
    my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 }),
    sy = useSpring(my, { stiffness: 60, damping: 18 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const lift = useTransform(scrollYProgress, [0, 1], [0, -120]),
    fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  return (
    <section
      ref={ref}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      className="relative -mt-20 flex min-h-[78svh] items-center overflow-hidden pb-10 pt-28"
    >
      {chips.map((ch, i) => (
        <Chip key={i} ch={ch} i={i} sx={sx} sy={sy} />
      ))}
      <motion.div
        style={{ y: lift, opacity: fade }}
        className="relative mx-auto w-full max-w-6xl px-4 text-center md:px-6"
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="chip mx-auto !py-1"
          style={{ '--c': color, backdropFilter: 'blur(10px)' } as CSSProperties}
        >
          <motion.span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}` }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          {label}
        </motion.div>
        <KineticTitle
          lines={lines}
          className="text-glow mx-auto mt-5 max-w-4xl text-[clamp(36px,5.4vw,72px)] font-extrabold leading-[1.02] tracking-[-0.03em]"
        />
        {sub && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            className="mx-auto mt-4 max-w-xl text-[14.5px] leading-relaxed text-[var(--muted)]"
          >
            {sub}
          </motion.p>
        )}
        {children && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="mt-8"
          >
            {children}
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}

function Chip({ ch, i, sx, sy }: { ch: HeroChip; i: number; sx: any; sy: any }) {
  const x = useTransform(sx, (v: number) => v * ch.depth * -70);
  const y = useTransform(sy, (v: number) => v * ch.depth * -50);
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute hidden lg:block"
      style={{ left: `${ch.x}%`, top: `${ch.y}%`, x, y }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.6 + i * 0.12, type: 'spring', stiffness: 160, damping: 16 }}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}
        className="flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{
          borderColor: `color-mix(in srgb, ${ch.c} 40%, transparent)`,
          background: 'rgba(10,12,26,.5)',
          backdropFilter: 'blur(14px)',
          boxShadow: `0 10px 40px -12px ${ch.c}`,
          transform: `scale(${0.85 + ch.depth * 0.2})`,
        }}
      >
        <span
          className="grid h-7 w-7 place-items-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${ch.c} 18%, transparent)`, color: ch.c }}
        >
          {ch.icon}
        </span>
        <span className="text-left">
          <span className="mono block text-[14px] font-semibold" style={{ color: ch.c }}>
            {ch.value}
          </span>
          <span className="block text-[10.5px] text-[var(--muted)]">{ch.label}</span>
        </span>
      </motion.div>
    </motion.div>
  );
}
