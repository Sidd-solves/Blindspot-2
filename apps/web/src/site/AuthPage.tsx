import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { useAuth } from '../auth';

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';
const go = (h: string) => (location.hash = h);

/** Password strength: length and variety. Shown as a filling bar, never as a rule wall. */
function strength(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}
const STRENGTH = [
  { l: 'Too short', c: 'var(--faint)' },
  { l: 'Weak', c: 'var(--amber)' },
  { l: 'Okay', c: 'var(--amber)' },
  { l: 'Strong', c: 'var(--emerald)' },
  { l: 'Very strong', c: 'var(--emerald)' },
];

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-bold text-[var(--muted)]">{label}</span>
      <span className="relative flex items-center">
        <span className="pointer-events-none absolute left-2.5 text-[var(--faint)]">{icon}</span>
        {children}
      </span>
    </label>
  );
}

/** The left half: a live, looping preview of what an account gets you. */
function Showcase() {
  const items = [
    { t: '10 best customers went quiet', v: '£93,531', c: 'var(--amber)' },
    { t: 'New customers reorder less', v: '51% → 42%', c: 'var(--violet)' },
    { t: '23 products stopped selling', v: '£36,302', c: 'var(--orange)' },
  ];
  return (
    <div className="relative hidden overflow-hidden lg:block">
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 20%, color-mix(in srgb, var(--violet) 40%, transparent), transparent), radial-gradient(50% 50% at 80% 70%, color-mix(in srgb, var(--cyan) 35%, transparent), transparent), radial-gradient(40% 40% at 60% 10%, color-mix(in srgb, var(--fuchsia) 30%, transparent), transparent)',
        }}
        animate={{ backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="grid-bg !opacity-40" />
      <div className="relative flex h-full flex-col justify-between p-10">
        <button onClick={() => go('/')} className="flex items-center gap-2 text-[14px] font-extrabold">
          <span
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: 'linear-gradient(135deg, var(--violet), var(--cyan))' }}
          >
            <Sparkles size={15} color="white" />
          </span>
          Blindspot
        </button>
        <div>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md text-[34px] font-extrabold leading-[1.1] tracking-tight"
          >
            Your shop’s numbers, <span className="grad-text">checked before you see them.</span>
          </motion.h2>
          <div className="mt-6 max-w-sm space-y-2">
            {items.map((x, i) => (
              <motion.div
                key={x.t}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.15, type: 'spring', stiffness: 220, damping: 22 }}
                className="panel flex items-center gap-3 px-3 py-2.5"
                style={{ backdropFilter: 'blur(16px)' }}
              >
                <motion.span
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ background: x.c, boxShadow: `0 0 10px ${x.c}` }}
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{x.t}</span>
                <span className="mono text-[12.5px]" style={{ color: x.c }}>
                  {x.v}
                </span>
                <BadgeCheck size={13} style={{ color: 'var(--emerald)' }} />
              </motion.div>
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-4 flex items-center gap-1.5 text-[12px] text-[var(--muted)]"
          >
            <BadgeCheck size={13} style={{ color: 'var(--emerald)' }} />
            Every figure the AI writes is matched against the analysis engine.
          </motion.div>
        </div>
        <div className="text-[11.5px] text-[var(--faint)]">
          Read-only. Your files are analysed in memory; an account saves only the results you choose.
        </div>
      </div>
    </div>
  );
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const a = useAuth();
  const [email, setEmail] = useState(''),
    [password, setPw] = useState(''),
    [name, setName] = useState(''),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState<string | null>(null),
    [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    setDone(null);
  }, [mode]);
  // Already signed in: the login and sign-up pages have nothing to do.
  useEffect(() => {
    if (a.ready && a.user && (mode === 'login' || mode === 'signup')) go('/overview');
  }, [a.ready, a.user, mode]);
  const st = useMemo(() => strength(password), [password]);
  const tabs = mode === 'login' || mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    if (mode === 'login') {
      const m = await a.signIn(email.trim(), password);
      if (m) setErr(m);
      else go('/overview');
    } else if (mode === 'signup') {
      if (password.length < 8) setErr('Use a longer password: at least 8 characters.');
      else {
        const r = await a.signUp(email.trim(), password, name.trim());
        if (r.error) setErr(r.error);
        else if (r.needsConfirm)
          setDone(`We sent a link to ${email.trim()}. Open it to finish creating your account.`);
        else go('/overview');
      }
    } else if (mode === 'forgot') {
      const m = await a.sendReset(email.trim());
      if (m) setErr(m);
      else setDone(`If there’s an account for ${email.trim()}, a reset link is on its way. It works once.`);
    } else {
      if (password.length < 8) setErr('Use a longer password: at least 8 characters.');
      else {
        const m = await a.setPassword(password);
        if (m) setErr(m);
        else setDone('Password changed. You’re signed in.');
      }
    }
    setBusy(false);
  };

  const title = {
    login: 'Welcome back',
    signup: 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[mode];

  return (
    <div className="grid min-h-screen bg-[var(--bg)] lg:grid-cols-[1.1fr_1fr]">
      <Showcase />
      <div className="relative flex items-center justify-center px-4 py-10">
        <div className="grid-bg lg:hidden" />
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
          className="relative w-full max-w-[380px]"
        >
          <button
            onClick={() => (tabs ? go('/') : go('/login'))}
            className="mb-5 flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={13} /> {tabs ? 'Back to the site' : 'Back to log in'}
          </button>
          <h1 className="text-[24px] font-extrabold tracking-tight">{title}</h1>

          {tabs && (
            <div
              className="relative mt-4 grid grid-cols-2 rounded-lg border p-0.5"
              style={{ borderColor: 'var(--line)' }}
            >
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => go(`/${m}`)}
                  className="relative z-10 h-8 text-[12.5px] font-bold"
                  style={{ color: mode === m ? 'var(--text)' : 'var(--muted)' }}
                >
                  {mode === m && (
                    <motion.span
                      layoutId="auth-tab"
                      className="absolute inset-0 -z-10 rounded-md"
                      style={{ background: 'color-mix(in srgb, var(--violet) 22%, var(--panel))' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  {m === 'login' ? 'Log in' : 'Sign up'}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {done ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="panel mt-5 p-5 text-center"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                  className="mx-auto grid h-12 w-12 place-items-center rounded-full"
                  style={{
                    background: 'color-mix(in srgb, var(--emerald) 18%, transparent)',
                    color: 'var(--emerald)',
                  }}
                >
                  {mode === 'reset' ? <BadgeCheck size={22} /> : <MailCheck size={22} />}
                </motion.div>
                <p className="mt-3 text-[13px] leading-snug">{done}</p>
                <button
                  onClick={() => go(mode === 'reset' ? '/overview' : '/login')}
                  className="btn mt-4 w-full !h-9 justify-center"
                  style={{ '--c': 'var(--violet)' } as CSSProperties}
                >
                  {mode === 'reset' ? 'Open the app' : 'Back to log in'} <ArrowRight size={13} />
                </button>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={submit}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-5 space-y-3"
                noValidate
              >
                {mode === 'reset' && !a.user && (
                  <div className="text-[12px] text-[var(--muted)]">
                    Open this page from the link in your reset email. Links work once and expire after an
                    hour.
                  </div>
                )}
                {mode === 'signup' && (
                  <Field icon={<User size={14} />} label="Your name">
                    <input
                      className="input w-full !pl-8"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      placeholder="Alex Morgan"
                      maxLength={80}
                    />
                  </Field>
                )}
                {mode !== 'reset' && (
                  <Field icon={<Mail size={14} />} label="Email">
                    <input
                      className="input w-full !pl-8"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@yourshop.com"
                    />
                  </Field>
                )}
                {mode !== 'forgot' && (
                  <Field icon={<Lock size={14} />} label={mode === 'reset' ? 'New password' : 'Password'}>
                    <input
                      className="input w-full !pl-8 !pr-9"
                      type={show ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPw(e.target.value)}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-2 text-[var(--faint)] hover:text-[var(--text)]"
                      aria-label={show ? 'Hide password' : 'Show password'}
                    >
                      {show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </Field>
                )}
                {(mode === 'signup' || mode === 'reset') && password && (
                  <div className="flex items-center gap-2">
                    <div className="grid flex-1 grid-cols-4 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1 rounded-full"
                          animate={{ background: i < st ? STRENGTH[st].c : 'var(--line)' }}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-bold" style={{ color: STRENGTH[st].c }}>
                      {STRENGTH[st].l}
                    </span>
                  </div>
                )}
                {mode === 'login' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => go('/forgot')}
                      className="text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
                <AnimatePresence>
                  {err && (
                    <motion.div
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-md border px-2.5 py-1.5 text-[12px]"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--rose) 45%, var(--line))',
                        color: 'var(--rose)',
                      }}
                    >
                      {err}
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={busy || (mode === 'reset' && !a.user)}
                  className="relative flex h-10 w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg text-[13px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--violet), var(--fuchsia))' }}
                >
                  <motion.span
                    aria-hidden
                    className="absolute inset-y-0 -left-1/3 w-1/3"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent)',
                    }}
                    animate={{ x: ['0%', '420%'] }}
                    transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5 }}
                  />
                  {busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : mode === 'forgot' ? (
                    <Mail size={14} />
                  ) : mode === 'reset' ? (
                    <KeyRound size={14} />
                  ) : null}
                  {busy
                    ? 'One moment…'
                    : {
                        login: 'Log in',
                        signup: 'Create account',
                        forgot: 'Send reset link',
                        reset: 'Save new password',
                      }[mode]}
                </motion.button>
                {tabs && (
                  <>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--faint)]">
                      <span className="h-px flex-1 bg-[var(--line)]" /> or{' '}
                      <span className="h-px flex-1 bg-[var(--line)]" />
                    </div>
                    <button
                      type="button"
                      onClick={() => go('/overview')}
                      className="btn h-10 w-full justify-center text-[13px]"
                    >
                      Continue as guest <ArrowRight size={13} />
                    </button>
                    <p className="text-center text-[11px] text-[var(--faint)]">
                      Guests can use everything. An account keeps your profile and saved analyses.
                    </p>
                  </>
                )}
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
