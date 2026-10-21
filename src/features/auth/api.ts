import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase/client';
import { unregisterPush } from '@/lib/push';

/** Deep link Supabase sends email links back to. Must be in the project's redirect allow-list. */
export const authCallbackUrl = (params?: Record<string, string>) =>
  Linking.createURL('auth/callback', { queryParams: params });

/** Returns true when a session started immediately (email confirmation disabled). */
export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authCallbackUrl() },
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
