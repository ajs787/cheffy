import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';

import { TERMS_VERSION, WEB_URL } from '@/constants/app';

import { supabase } from '@/lib/supabase/client';
import { unregisterPush } from '@/lib/push';

/**
 * Where Supabase sends email links. Real builds use https://cheffy.me, which
 * opens Cheffy (Universal Links) or a page with an "Open Cheffy" button. Expo
 * Go can't claim the domain, so development keeps its own exp:// link. Both
 * must be in the project's redirect allow-list.
 */
export function authCallbackUrl(params?: Record<string, string>): string {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return Linking.createURL('auth/callback', { queryParams: params });
  }
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return `${WEB_URL}/auth/callback${query}`;
}

/** Returns true when a session started immediately (email confirmation disabled). */
export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // The Terms checkbox is required; the database records this version.
    options: { emailRedirectTo: authCallbackUrl(), data: { terms_version: TERMS_VERSION } },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

/** Sends the sign-up confirmation email again (Supabase also rate-limits this). */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authCallbackUrl() },
  });
  if (error) throw error;
}

/** Supabase's sign-in error for an account whose email isn't confirmed yet. */
export function isEmailNotConfirmed(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === 'email_not_confirmed' || /email not confirmed/i.test(e?.message ?? '');
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  // Stop this phone getting the signed-out person's notifications.
  await unregisterPush().catch(() => undefined);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authCallbackUrl({ type: 'recovery' }),
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Completes a PKCE email link (confirmation or recovery). */
export async function exchangeCode(code: string): Promise<void> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}
