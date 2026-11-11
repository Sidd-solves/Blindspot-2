import { createClient } from '@supabase/supabase-js';

/**
 * Accounts and saved analyses live in Supabase. The publishable key is meant to ship in the browser: row-level
 * security on every table means a signed-in user can only ever read or change their own rows.
 */
const URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://txxrblgxnwxuuvyqyzuw.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_PN1nnJFzo2riwWv8-Oo8Jw_jDQs3aw-';

export const supabase = createClient(URL, KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Where email links (confirm sign-up, reset password) send people back to. */
export const callbackUrl = (next: 'reset' | 'overview') => `${location.origin}/auth/callback?next=${next}`;
