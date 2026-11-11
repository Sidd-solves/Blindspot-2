import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/** Animated aurora + dot grid that brightens around the cursor. Calms down for reduced-motion users. */
export function Aurora() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!,
      ctx = cv.getContext('2d')!;
    const slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    let w = 0,
      h = 0,
      raf = 0,
      mx = -999,
      my = -999;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
    };
    const blobs = [
      { c: '167,139,250', x: 0.2, y: 0.25, r: 0.42, sx: 0.00021, sy: 0.00017 },
      { c: '34,211,238', x: 0.8, y: 0.3, r: 0.36, sx: 0.00017, sy: 0.00023 },
      { c: '232,121,249', x: 0.55, y: 0.85, r: 0.4, sx: 0.00025, sy: 0.00014 },
    ];
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of blobs) {
        const x = (b.x + Math.sin(t * b.sx * slow) * 0.12) * w,
          y = (b.y + Math.cos(t * b.sy * slow) * 0.1) * h,
          r = b.r * Math.max(w, h);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${b.c},0.20)`);
        g.addColorStop(1, `rgba(${b.c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
      const gap = 26;
      for (let x = gap / 2; x < w; x += gap)
        for (let y = gap / 2; y < h; y += gap) {
          const d = Math.hypot(x - mx, y - my),
            near = Math.max(0, 1 - d / 180);
          const pulse = 0.5 + 0.5 * Math.sin(t * 0.0012 * slow + x * 0.03 + y * 0.02);
          ctx.fillStyle =
            near > 0 ? `rgba(196,181,253,${0.12 + near * 0.75})` : `rgba(150,140,255,${0.05 + pulse * 0.06})`;
          ctx.beginPath();
          ctx.arc(x, y, near > 0 ? 1.1 + near * 1.6 : 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      raf = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
    };
  }, []);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}

/** Soft spotlight that follows the cursor across the whole site. */
export function Spotlight() {
  const x = useMotionValue(-500),
    y = useMotionValue(-500);
  const sx = useSpring(x, { stiffness: 120, damping: 20 }),
    sy = useSpring(y, { stiffness: 120, damping: 20 });
  useEffect(() => {
    const m = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener('pointermove', m);
    return () => window.removeEventListener('pointermove', m);
  }, [x, y]);
  const bg = useTransform(
    [sx, sy] as any,
    ([a, b]: number[]) =>
      `radial-gradient(520px circle at ${a}px ${b}px, rgba(167,139,250,0.10), transparent 60%)`,
  );
  return (
    <motion.div className="pointer-events-none fixed inset-0 z-0" style={{ background: bg }} aria-hidden />
  );
}

/** Card with a light beam that runs around its border on hover, and a gentle 3D tilt. */
export function BeamCard({
  children,
  c = 'var(--violet)',
  className = '',
  style,
  on,
}: {
  children: ReactNode;
  c?: string;
  className?: string;
  style?: CSSProperties;
  on?: boolean;
}) {
  const rx = useMotionValue(0),
    ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 200, damping: 18 }),
    sry = useSpring(ry, { stiffness: 200, damping: 18 });
  return (
    <motion.div
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 6);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 6);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      whileHover={{ y: -3 }}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900, '--c': c, ...style } as any}
      className={`beam panel ${on ? 'on' : ''} ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function Marquee({ items }: { items: { t: string; c: string }[] }) {
  const row = [...items, ...items];
  return (
    <div
      className="relative overflow-hidden py-1"
      style={{ maskImage: 'linear-gradient(90deg, transparent, black 10%, black 90%, transparent)' }}
    >
      <div className="marquee">
        {row.map((x, i) => (
          <span key={i} className="chip !px-3 !py-1 !text-[11.5px]" style={{ '--c': x.c } as CSSProperties}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: x.c, boxShadow: `0 0 8px ${x.c}` }}
            />
            {x.t}
          </span>
        ))}
      </div>
    </div>
  );
}
