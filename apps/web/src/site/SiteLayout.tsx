import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { ArrowRight, Github } from 'lucide-react';
import { Spotlight } from './Effects';

export const SITE = [
  { id: 'home', label: 'Home', hash: '#/' },
  { id: 'how', label: 'How it works', hash: '#/how' },
  { id: 'features', label: 'Features', hash: '#/features' },
  { id: 'results', label: 'Real results', hash: '#/results' },
] as const;
export type SiteId = (typeof SITE)[number]['id'];
export const siteGo = (id: SiteId) => {
  location.hash = SITE.find((s) => s.id === id)!.hash.slice(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
export const openApp = (page = 'start') => {
  location.hash = `/${page}`;
  window.scrollTo({ top: 0 });
};

export const Logo = ({ size = 15 }: { size?: number }) => (
  <button onClick={() => siteGo('home')} className="flex items-center gap-2" aria-label="Blindspot home">
    <motion.div
      whileHover={{ rotate: -12, scale: 1.08 }}
      className="grid h-7 w-7 place-items-center rounded-lg"
      style={{
        background: 'linear-gradient(135deg, var(--violet), var(--fuchsia) 55%, var(--cyan))',
        boxShadow: '0 0 22px -4px var(--violet)',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 32 32">
        <path
          d="M7 21l6-7 5 4 7-9"
          stroke="white"
          strokeWidth="3.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
    <span className="font-extrabold tracking-tight" style={{ fontSize: size }}>
      Blind<span className="grad-text">spot</span>
    </span>
  </button>
);

export default function SiteLayout({ page, children }: { page: string; children: ReactNode }) {
  return (
    <div className="site-dark relative min-h-screen overflow-x-clip">
      <Spotlight />
      <header className="fixed inset-x-0 top-0 z-40">
        <div
          className="mx-auto mt-3 flex max-w-6xl items-center gap-3 rounded-2xl border px-3 py-2 backdrop-blur-xl md:px-4"
          style={{
            borderColor: 'var(--line)',
            background: 'color-mix(in srgb, var(--bg) 62%, transparent)',
            boxShadow: '0 10px 40px -20px rgba(0,0,0,.8)',
          }}
        >
          <Logo />
          <nav className="ml-2 hidden items-center gap-0.5 md:flex">
            {SITE.map((s) => (
              <button
                key={s.id}
                onClick={() => siteGo(s.id)}
                className="relative rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors"
                style={{ color: page === s.id ? 'var(--text)' : 'var(--muted)' }}
              >
                {page === s.id && (
                  <motion.span
                    layoutId="site-pill"
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: 'color-mix(in srgb, var(--violet) 16%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--violet) 32%, transparent)',
                    }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{s.label}</span>
              </button>
            ))}
          </nav>
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.03 }}
            onClick={() => openApp()}
            className="btn btn-primary ml-auto !h-8"
          >
            Open the app
            <ArrowRight size={13} />
          </motion.button>
        </div>
        <nav className="mx-3 mt-2 flex gap-1 overflow-x-auto md:hidden">
          {SITE.map((s) => (
            <button
              key={s.id}
              onClick={() => siteGo(s.id)}
              className="chip !py-1"
              style={{ '--c': page === s.id ? 'var(--violet)' : 'var(--faint)' } as any}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>
      <motion.main
        key={page}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 pt-20"
      >
        {children}
      </motion.main>
      <footer
        className="relative z-10 border-t px-4 py-8 text-[11px] text-[var(--faint)] md:px-6"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <Logo />
            <div className="max-w-xs">
              The AI analyst for small businesses. See what your sales data is hiding.
            </div>
          </div>
          <div className="flex gap-10">
            <div className="space-y-1.5">
              <div className="label">Product</div>
              {SITE.slice(1).map((s) => (
                <button key={s.id} onClick={() => siteGo(s.id)} className="block hover:text-[var(--text)]">
                  {s.label}
                </button>
              ))}
              <button onClick={() => openApp()} className="block hover:text-[var(--text)]">
                Open the app
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="label">Project</div>
              <a
                href="https://github.com/Sidd-solves/BlindSpot"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-[var(--text)]"
              >
                <Github size={12} />
                GitHub
              </a>
              <button onClick={() => siteGo('results')} className="block hover:text-[var(--text)]">
                Fact check
              </button>
            </div>
          </div>
          <div className="max-w-sm">Case-study data: UCI Online Retail II (CC BY 4.0).</div>
        </div>
      </footer>
    </div>
  );
}
