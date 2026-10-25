import { useEffect, useRef, useState } from 'react';

import * as Application from 'expo-application';

import { classifyError, KIND_MESSAGES, toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';

import { parseRateLimit, rateLimitMessage, waitSeconds } from './rateLimit';

export type AuthOperation = 'signup' | 'signin' | 'password_reset' | 'resend_confirmation';

/**
 * Safe diagnostics for a failed auth request: which operation, the HTTP
 * status, Supabase's error code, how we classified it, and when. Never the
 * email, password or any token. Visible in Xcode/Console device logs.
 */
export function logAuthFailure(operation: AuthOperation, error: unknown, durationMs?: number): void {
  const e = (error ?? {}) as { status?: number; code?: string; name?: string };
  console.warn('[auth]', {
    operation,
    kind: classifyError(error),
    rateLimit: parseRateLimit(error)?.kind ?? null,
    status: e.status ?? null,
    code: e.code ?? null,
    name: e.name ?? null,
    durationMs: durationMs ?? null,
    app: `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? 'dev'})`,
    at: new Date().toISOString(),
  });
}

/**
 * The message for a failed auth request. A sign-up that timed out or hit a
 * server error may still have created the account, so it says so instead of
 * inviting a blind retry (which would just say the email is taken).
 */
export function authFailureMessage(operation: AuthOperation, error: unknown): string {
  const limit = parseRateLimit(error);
  if (limit) return rateLimitMessage(limit);
  const kind = classifyError(error);
  if (operation === 'signup' && (kind === 'timeout' || kind === 'unreachable' || kind === 'unavailable')) {
    return `${KIND_MESSAGES[kind]} If a confirmation email arrives, your account was created — just open the link.`;
  }
  return toUserMessage(error);
}

/**
 * Runs an auth request at most once at a time. The button and the keyboard's
 * Done key can both call `submit`; a ref (not state) blocks the second call
 * synchronously. After a rate-limit response the form stays locked for the
 * time Supabase asked for, with a visible countdown. Nothing retries
 * automatically, and the form keeps what the person typed.
 */
export function useAuthSubmit() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  useEffect(() => {
    if (secondsLeft === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  /** `operation` names the request in diagnostics, e.g. 'signup'. */
  const submit = async (operation: AuthOperation, request: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current || secondsLeft > 0) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const started = Date.now();
    try {
      await request();
      haptics.success();
      return true;
    } catch (e) {
      haptics.error();
      logAuthFailure(operation, e, Date.now() - started);
      const limit = parseRateLimit(e);
      if (limit) {
        // Lock only for a wait Supabase actually gave; never a made-up one.
        const wait = waitSeconds(limit);
        if (wait !== null) {
          setNow(Date.now());
          setLockedUntil(Date.now() + wait * 1000);
        }
      }
      setError(authFailureMessage(operation, e));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return { submit, busy, error, secondsLeft, locked: secondsLeft > 0 };
}
