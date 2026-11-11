import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck } from 'lucide-react';

/**
 * "Rows in, problems out": thousands of particles (sales rows) stream in from the left, pass through a spinning
 * engine ring, and leave sorted into coloured streams, one per kind of problem; clean rows fade out grey. The mouse
 * pushes particles aside. Counters tick with what has flowed through. Pure canvas 2D, paused off-screen.
 */
const STREAMS = [
  { label: 'Best customers gone quiet', c: '#fbbf24', w: 0.1 },
  { label: 'Products that stopped selling', c: '#fb923c', w: 0.08 },
  { label: 'Orders reversed in 2 days', c: '#38bdf8', w: 0.07 },
  { label: 'New customers reorder less', c: '#a78bfa', w: 0.06 },
];
const CLEAN = 1 - STREAMS.reduce((s, x) => s + x.w, 0);

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lane: number; // -1 before the engine, 0..3 problem streams, 4 clean
  life: number;
  r: number;
}

export function RowRiver() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const inView = useInView(wrap, { margin: '200px' });
  const [counts, setCounts] = useState({ rows: 0, s: [0, 0, 0, 0] });
  const live = useRef(inView);
  live.current = inView;

  useEffect(() => {
    const c = cv.current!;
    const ctx = c.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0,
      H = 0,
      dpr = 1;
    const size = () => {
      dpr = Math.min(2, devicePixelRatio);
      W = c.clientWidth;
      H = c.clientHeight;
      c.width = W * dpr;
      c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    const ps: P[] = [];
    const MAX = W < 700 ? 520 : 1300;
    let mx = -1e4,
      my = -1e4;
    const move = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
    };
    const leave = () => {
      mx = my = -1e4;
    };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerleave', leave);
    const lanesY = () => STREAMS.map((_, i) => H * (0.2 + i * 0.17));
    const spawn = () => {
      ps.push({
        x: -10,
        y: H * (0.15 + Math.random() * 0.7),
        vx: 3.2 + Math.random() * 2.4,
        vy: 0,
        lane: -1,
        life: 1,
        r: 0.8 + Math.random() * 1.3,
      });
    };
    let rows = 0;
    const s = [0, 0, 0, 0];
    let raf = 0,
      t = 0,
      last = 0;
    let warmed = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!live.current) {
        last = 0;
        return;
      }
      // First time on screen: run the flow ~4 s ahead without drawing, so the river is already full.
      if (!warmed) {
        warmed = true;
        for (let k = 0; k < 240; k++) step(1, false);
      }
      const dt = Math.min(2.5, (now - (last || now)) / 16.7);
      last = now;
      step(dt, true);
      if (Math.round(t) % 6 === 0) setCounts({ rows, s: [...s] });
    };
    const step = (dt: number, draw: boolean) => {
      t += dt;
      const cx = W * 0.5,
        cy = H * 0.5,
        R = Math.min(W, H) * 0.17;
      const ly = lanesY();
      // spawn
      const rate = still ? 3 : 14;
      for (let k = 0; k < rate && ps.length < MAX; k++) spawn();
      // trails
      if (draw) ctx.globalCompositeOperation = 'destination-out';
      if (draw) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
      }
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        const dx = p.x - cx,
          dy = p.y - cy,
          d = Math.hypot(dx, dy);
        if (p.lane === -1) {
          // pulled into the engine, swirl around it
          p.vy += (-dy / Math.max(40, d)) * 0.18 * dt;
          if (d < R * 1.1) {
            p.vx += (-dy / d) * 0.25 * dt;
            p.vy += (dx / d) * 0.25 * dt;
          }
          if (p.x > cx + R * 0.6) {
            const u = Math.random();
            let acc = 0;
            p.lane = 4;
            for (let k = 0; k < STREAMS.length; k++) {
              acc += STREAMS[k].w;
              if (u < acc) {
                p.lane = k;
                break;
              }
            }
            if (p.lane < 4) s[p.lane]++;
            rows++;
          }
        } else {
          const target = p.lane < 4 ? ly[p.lane] : cy + (p.y > cy ? 1 : -1) * H * 0.02;
          p.vy += (target - p.y) * 0.012 * dt;
          p.vy *= 0.9;
          p.vx += (5 - p.vx) * 0.05 * dt;
          if (p.lane === 4) p.life -= 0.012 * dt;
        }
        // mouse repels
        const mdx = p.x - mx,
          mdy = p.y - my,
          md = Math.hypot(mdx, mdy);
        if (md < 90) {
          const f = ((90 - md) / 90) * 1.4;
          p.vx += (mdx / (md || 1)) * f * dt;
          p.vy += (mdy / (md || 1)) * f * dt;
        }
        p.vx = Math.min(8, Math.max(1, p.vx));
        p.x += p.vx * dt * (still ? 0.4 : 1);
        p.y += p.vy * dt * (still ? 0.4 : 1);
        if (p.x > W + 10 || p.life <= 0) {
          ps.splice(i, 1);
          continue;
        }
        if (!draw) continue;
        const col = p.lane === -1 ? '200,205,255' : p.lane === 4 ? '150,150,175' : hex(STREAMS[p.lane].c);
        const a = p.lane === -1 ? 0.55 : p.lane === 4 ? 0.35 * p.life : 0.9;
        ctx.fillStyle = `rgba(${col},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.lane >= 0 && p.lane < 4 ? p.r * 1.35 : p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!draw) return;
      // engine ring
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.012);
      ctx.strokeStyle = 'rgba(167,139,250,.85)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#a78bfa';
      ctx.shadowBlur = 18;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(-t * 0.03);
      ctx.strokeStyle = 'rgba(34,211,238,.6)';
      ctx.setLineDash([4, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <section ref={wrap} className="relative">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="label" style={{ color: 'var(--violet)' }}>
            Inside the engine
          </div>
          <h2 className="mt-1.5 max-w-3xl text-[28px] font-extrabold leading-tight tracking-tight md:text-[40px]">
            Thousands of rows in. <span className="grad-text">A handful of problems out.</span>
          </h2>
        </motion.div>
      </div>
      <div className="relative mt-4 h-[62vh] min-h-[380px]">
        <canvas ref={cv} className="absolute inset-0 h-full w-full cursor-crosshair" aria-hidden />
        {/* left: rows going in */}
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 md:left-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))]">
          <div className="mono text-[26px] font-semibold md:text-[34px]">{counts.rows.toLocaleString()}</div>
          <div className="text-[11.5px] text-[var(--muted)]">rows checked so far</div>
        </div>
        {/* centre label */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="label" style={{ color: 'var(--violet)' }}>
            engine
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">40 tools · no AI guessing</div>
        </div>
        {/* right: streams out */}
        <div className="pointer-events-none absolute right-4 top-0 h-full md:right-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))]">
          {STREAMS.map((x, i) => (
            <div
              key={x.label}
              className="absolute right-0 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-right backdrop-blur-md"
              style={{
                top: `${20 + i * 17}%`,
                borderColor: `color-mix(in srgb, ${x.c} 45%, transparent)`,
                background: 'rgba(8,10,22,.55)',
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: x.c, boxShadow: `0 0 10px ${x.c}` }}
              />
              <span className="hidden text-[11.5px] font-semibold sm:inline">{x.label}</span>
              <span className="mono text-[12px]" style={{ color: x.c }}>
                {counts.s[i].toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto -mt-2 flex max-w-6xl items-center gap-1.5 px-4 text-[11px] text-[var(--faint)] md:px-6">
        <BadgeCheck size={12} style={{ color: 'var(--emerald)' }} />
        An illustration of the flow, not live data: about {Math.round((1 - CLEAN) * 100)}% of rows here end up
        in a finding. Move your mouse through the stream.
      </div>
    </section>
  );
}

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
