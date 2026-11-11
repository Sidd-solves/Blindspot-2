import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { callbackUrl, supabase } from './lib/supabase';

export interface Profile {
  id: string;
  display_name: string | null;
  shop_name: string | null;
  currency: string | null;
  accent: 'violet' | 'cyan' | 'emerald' | 'amber' | 'fuchsia' | 'sky';
  email_digest: boolean;
  created_at: string;
}
export interface SavedAnalysis {
  id: string;
  name: string;
  dataset_name: string | null;
  row_count: number | null;
  health: number | null;
  top_finding: string | null;
  at_stake: number | null;
  currency: string | null;
  summary: Record<string, unknown>;
  created_at: string;
}

interface Auth {
  ready: boolean;
  user: User | null;
  profile: Profile | null;
  /** Set when the user arrived from a password-reset email and must choose a new password. */
  recovering: boolean;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(
    email: string,
    password: string,
    name: string,
  ): Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut(): Promise<void>;
  sendReset(email: string): Promise<string | null>;
  setPassword(password: string): Promise<string | null>;
  saveProfile(p: Partial<Omit<Profile, 'id' | 'created_at'>>): Promise<string | null>;
  listSaved(): Promise<SavedAnalysis[]>;
  saveAnalysis(a: Omit<SavedAnalysis, 'id' | 'created_at'>): Promise<string | null>;
  deleteSaved(id: string): Promise<string | null>;
}
const Ctx = createContext<Auth | null>(null);

/** Supabase's messages, in plain words. */
const plain = (m?: string) =>
  !m
    ? null
    : /invalid login/i.test(m)
      ? 'That email and password don’t match an account.'
      : /email not confirmed/i.test(m)
        ? 'Confirm your email first: open the link we sent you.'
        : /already registered|already been registered/i.test(m)
          ? 'There’s already an account with that email. Log in instead.'
          : /rate limit|too many/i.test(m)
            ? 'Too many tries. Wait a minute and try again.'
            : /password.*(at least|short|weak)/i.test(m)
              ? 'Use a longer password: at least 8 characters.'
              : m;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const user = session?.user ?? null;

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) return setProfile(null);
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    // Back from an email link: /auth/callback?code=…&next=reset|overview. The client exchanges the code itself.
    const fromEmail = location.pathname === '/auth/callback';
    const next = new URLSearchParams(location.search).get('next');
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session?.user.id).finally(() => setReady(true));
      if (fromEmail) {
        history.replaceState(null, '', `/#/${next === 'reset' ? 'reset' : 'overview'}`);
        if (next === 'reset') setRecovering(true);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
        location.hash = '/reset';
      }
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED')
        loadProfile(s?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: Auth = {
    ready,
    user,
    profile,
    recovering,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return plain(error?.message);
    },
    async signUp(email, password, name) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name }, emailRedirectTo: callbackUrl('overview') },
      });
      return { error: plain(error?.message), needsConfirm: !error && !data.session };
    },
    async signOut() {
      await supabase.auth.signOut();
      setProfile(null);
    },
    async sendReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl('reset'),
      });
      return plain(error?.message);
    },
    async setPassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (!error) setRecovering(false);
      return plain(error?.message);
    },
    async saveProfile(p) {
      if (!user) return 'Log in first.';
      const { data, error } = await supabase
        .from('profiles')
        .update(p)
        .eq('id', user.id)
        .select()
        .maybeSingle();
      if (data) setProfile(data as Profile);
      return plain(error?.message);
    },
    async listSaved() {
      if (!user) return [];
      const { data } = await supabase
        .from('saved_analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return (data as SavedAnalysis[]) ?? [];
    },
    async saveAnalysis(a) {
      if (!user) return 'Log in to save analyses.';
      const { error } = await supabase.from('saved_analyses').insert(a);
      return plain(error?.message);
    },
    async deleteSaved(id) {
      const { error } = await supabase.from('saved_analyses').delete().eq('id', id);
      return plain(error?.message);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
};
