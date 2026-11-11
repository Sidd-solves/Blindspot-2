import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import {
  Bookmark,
  BookmarkPlus,
  Check,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  Palette,
  Save,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useAuth, type Profile, type SavedAnalysis } from '../auth';
import { useStore } from '../store';
import { usd } from '../api';
import { Card, CardHead, Chip, Dropdown, Empty, Ring } from '../components/ui';

const ACCENTS: Profile['accent'][] = ['violet', 'cyan', 'emerald', 'amber', 'fuchsia', 'sky'];
const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'INR', 'JPY'];
const PENALTY: Record<string, number> = { critical: 20, high: 10, medium: 5, low: 1 };
const TABS = [
  { id: 'profile', label: 'Profile', icon: UserRound, c: 'var(--violet)' },
  { id: 'saved', label: 'Saved analyses', icon: Bookmark, c: 'var(--cyan)' },
  { id: 'security', label: 'Security', icon: ShieldCheck, c: 'var(--emerald)' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const initials = (s: string) =>
  s
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

export function Avatar({
  name,
  accent = 'violet',
  size = 28,
}: {
  name: string;
  accent?: string;
  size?: number;
}) {
  return (
    <span
      className="grid flex-none place-items-center rounded-full font-extrabold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, var(--${accent}), color-mix(in srgb, var(--${accent}) 50%, var(--fuchsia)))`,
        boxShadow: `0 0 14px color-mix(in srgb, var(--${accent}) 45%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

function ProfileTab() {
  const { profile, user, saveProfile } = useAuth();
  const [p, setP] = useState(profile);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | string>('idle');
  useEffect(() => setP(profile), [profile]);
  if (!p || !user) return null;
  const dirty = JSON.stringify(p) !== JSON.stringify(profile);
  const save = async () => {
    setState('busy');
    const m = await saveProfile({
      display_name: p.display_name?.trim() || null,
      shop_name: p.shop_name?.trim() || null,
      currency: p.currency,
      accent: p.accent,
      email_digest: p.email_digest,
    });
    setState(m ?? 'saved');
    if (!m) setTimeout(() => setState('idle'), 1800);
  };
  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-2 px-2">
        <motion.div layout key={p.accent}>
          <Avatar name={p.display_name || user.email || '?'} accent={p.accent} size={72} />
        </motion.div>
        <div className="text-center">
          <div className="text-[13px] font-extrabold">{p.display_name || 'No name yet'}</div>
          <div className="text-[11.5px] text-[var(--faint)]">{user.email}</div>
        </div>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[11.5px] font-bold text-[var(--muted)]">
            <UserRound size={11} /> Name
          </span>
          <input
            className="input w-full"
            value={p.display_name ?? ''}
            maxLength={80}
            onChange={(e) => setP({ ...p, display_name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[11.5px] font-bold text-[var(--muted)]">
            <Store size={11} /> Shop name
          </span>
          <input
            className="input w-full"
            value={p.shop_name ?? ''}
            maxLength={80}
            placeholder="Used in win-back messages"
            onChange={(e) => setP({ ...p, shop_name: e.target.value })}
          />
        </label>
        <div>
          <span className="mb-1 block text-[11.5px] font-bold text-[var(--muted)]">Show money in</span>
          <Dropdown
            width="100%"
            placeholder="Select..."
            value={p.currency ? [p.currency] : []}
            options={CURRENCIES}
            onChange={(v) => setP({ ...p, currency: v[0] ?? null })}
          />
        </div>
        <div>
          <span className="mb-1 flex items-center gap-1 text-[11.5px] font-bold text-[var(--muted)]">
            <Palette size={11} /> Accent
          </span>
          <div className="flex gap-1.5">
            {ACCENTS.map((a) => (
              <motion.button
                key={a}
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setP({ ...p, accent: a })}
                aria-label={`Accent ${a}`}
                aria-pressed={p.accent === a}
                className="grid h-7 w-7 place-items-center rounded-full"
                style={{
                  background: `var(--${a})`,
                  boxShadow: p.accent === a ? `0 0 0 2px var(--bg), 0 0 0 4px var(--${a})` : 'none',
                }}
              >
                {p.accent === a && <Check size={13} color="white" />}
              </motion.button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] sm:col-span-2">
          <input
            type="checkbox"
            checked={p.email_digest}
            onChange={(e) => setP({ ...p, email_digest: e.target.checked })}
            className="accent-[var(--violet)]"
          />
          <Mail size={12} className="text-[var(--muted)]" /> Email me a weekly summary when it launches
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={save}
            disabled={!dirty || state === 'busy'}
            className="btn !h-8"
            style={{ '--c': 'var(--violet)' } as CSSProperties}
          >
            {state === 'busy' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : state === 'saved' ? (
              <Check size={13} />
            ) : (
              <Save size={13} />
            )}
            {state === 'saved' ? 'Saved' : 'Save profile'}
          </motion.button>
          {state !== 'idle' && state !== 'busy' && state !== 'saved' && (
            <span role="alert" className="text-[12px]" style={{ color: 'var(--rose)' }}>
              {state}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SavedTab() {
  const { listSaved, saveAnalysis, deleteSaved, profile } = useAuth();
  const { dataset, findings, version } = useStore();
  const [list, setList] = useState<SavedAnalysis[] | null>(null);
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState<string | null>(null);
  const load = () => listSaved().then(setList);
  useEffect(() => {
    load();
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const health = Math.max(
    0,
    Math.round(100 - findings.reduce((s, f) => s + (PENALTY[f.severity] ?? 1) * f.confidence, 0)),
  );
  const top = findings.find((f) => f.exposure === 'lost' || f.exposure === 'at-risk') ?? findings[0];
  const save = async () => {
    if (!dataset) return;
    setBusy(true);
    setErr(null);
    const m = await saveAnalysis({
      name: `${dataset.label ?? dataset.name} · ${new Date().toLocaleDateString()}`,
      dataset_name: dataset.label ?? dataset.name,
      row_count: dataset.rows ?? null,
      health,
      top_finding: top?.title ?? null,
      at_stake: top?.impactUsd ?? null,
      currency: dataset.currency ?? profile?.currency ?? null,
      summary: {
        findings: findings.slice(0, 12).map((f) => ({
          id: f.id,
          title: f.title,
          severity: f.severity,
          basis: f.basis,
          impactUsd: f.impactUsd,
          period: f.period,
        })),
      },
    });
    if (m) setErr(m);
    await load();
    setBusy(false);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={save}
          disabled={busy || !dataset}
          className="btn !h-8"
          style={{ '--c': 'var(--cyan)' } as CSSProperties}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <BookmarkPlus size={13} />}
          Save the current analysis
        </motion.button>
        <span className="text-[11.5px] text-[var(--muted)]">
          Saves the results (health, findings, amounts), never your raw rows.
        </span>
        {err && (
          <span role="alert" className="text-[12px]" style={{ color: 'var(--rose)' }}>
            {err}
          </span>
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        {list === null && <div className="skeleton h-14" />}
        {list?.length === 0 && (
          <Empty icon={<Bookmark size={20} />} title="Nothing saved yet">
            Save an analysis to compare it with later ones.
          </Empty>
        )}
        <AnimatePresence initial={false}>
          {list?.map((s, i) => {
            const c =
              (s.health ?? 0) >= 80
                ? 'var(--emerald)'
                : (s.health ?? 0) >= 60
                  ? 'var(--amber)'
                  : 'var(--orange)';
            return (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.03 }}
                className="row-hover flex items-center gap-3 rounded-lg border px-2.5 py-2"
                style={{ borderColor: 'var(--line)' }}
              >
                <Ring value={(s.health ?? 0) / 100} size={38} stroke={4} c={c}>
                  <span className="mono text-[10.5px] font-bold">{s.health ?? '–'}</span>
                </Ring>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold">{s.name}</span>
                  <span className="block truncate text-[11px] text-[var(--faint)]">
                    {s.top_finding ?? 'No findings'}
                    {s.row_count ? ` · ${s.row_count.toLocaleString()} rows` : ''}
                  </span>
                </span>
                {s.at_stake ? <Chip c="var(--amber)">{usd(s.at_stake, true)}</Chip> : null}
                <button
                  onClick={async () => {
                    await deleteSaved(s.id);
                    load();
                  }}
                  className="btn !h-7 !px-2"
                  aria-label={`Delete ${s.name}`}
                >
                  <Trash2 size={12} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SecurityTab() {
  const { user, setPassword, signOut, sendReset } = useAuth();
  const [pw, setPw] = useState(''),
    [state, setState] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-1.5 text-[12.5px] font-bold">
          <KeyRound size={13} style={{ color: 'var(--emerald)' }} /> Change password
        </div>
        <input
          className="input mt-2 w-full"
          type="password"
          autoComplete="new-password"
          placeholder="New password (8+ characters)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={busy || pw.length < 8}
            onClick={async () => {
              setBusy(true);
              const m = await setPassword(pw);
              setState(m ?? 'Password changed.');
              if (!m) setPw('');
              setBusy(false);
            }}
            className="btn !h-8"
            style={{ '--c': 'var(--emerald)' } as CSSProperties}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Update password
          </motion.button>
          <button
            onClick={async () =>
              setState((await sendReset(user.email!)) ?? `Reset link sent to ${user.email}.`)
            }
            className="text-[11.5px] text-[var(--muted)] hover:text-[var(--text)]"
          >
            Email me a reset link instead
          </button>
        </div>
        {state && <div className="mt-2 text-[12px] text-[var(--muted)]">{state}</div>}
      </div>
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-1.5 text-[12.5px] font-bold">
          <ShieldCheck size={13} style={{ color: 'var(--cyan)' }} /> Your account
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-[var(--faint)]">Email</dt>
          <dd className="truncate">{user.email}</dd>
          <dt className="text-[var(--faint)]">Created</dt>
          <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
          <dt className="text-[var(--faint)]">Last sign-in</dt>
          <dd>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '—'}</dd>
        </dl>
        <motion.button whileTap={{ scale: 0.96 }} onClick={signOut} className="btn mt-3 !h-8">
          <LogOut size={13} /> Log out
        </motion.button>
      </div>
    </div>
  );
}

export default function Account() {
  const { ready, user } = useAuth();
  const [tab, setTab] = useState<Tab>(
    () =>
      (['profile', 'saved', 'security'] as const).find((t) => location.hash.includes(`tab=${t}`)) ??
      'profile',
  );
  if (!ready) return <div className="skeleton h-40" />;
  if (!user)
    return (
      <Card hover={false} className="p-6">
        <Empty icon={<UserRound size={22} />} title="You’re using Blindspot as a guest">
          Everything works without an account. Log in to keep a profile and save analyses.
          <div className="mt-3 flex justify-center gap-2">
            <button
              onClick={() => (location.hash = '/login')}
              className="btn !h-8"
              style={{ '--c': 'var(--violet)' } as CSSProperties}
            >
              <LogIn size={13} /> Log in
            </button>
            <button onClick={() => (location.hash = '/signup')} className="btn !h-8">
              Create an account
            </button>
          </div>
        </Empty>
      </Card>
    );
  const t = TABS.find((x) => x.id === tab)!;
  return (
    <Card c={t.c} hover={false}>
      <CardHead
        icon={<t.icon size={13} />}
        title="Account"
        c={t.c}
        right={
          <div className="relative flex rounded-lg border p-0.5" style={{ borderColor: 'var(--line)' }}>
            {TABS.map((x) => (
              <button
                key={x.id}
                onClick={() => setTab(x.id)}
                className="relative z-10 flex h-7 items-center gap-1 px-2.5 text-[11.5px] font-bold"
                style={{ color: tab === x.id ? 'var(--text)' : 'var(--muted)' }}
              >
                {tab === x.id && (
                  <motion.span
                    layoutId="acct-tab"
                    className="absolute inset-0 -z-10 rounded-md"
                    style={{ background: `color-mix(in srgb, ${x.c} 22%, var(--panel))` }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <x.icon size={11} style={{ color: x.c }} />
                {x.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-3.5 pb-3.5">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            {tab === 'profile' ? <ProfileTab /> : tab === 'saved' ? <SavedTab /> : <SecurityTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}
