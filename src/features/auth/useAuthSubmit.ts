import { useEffect, useRef, useState } from 'react';

import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';

import { parseRateLimit, rateLimitMessage, waitSeconds } from './rateLimit';

export type AuthOperation = 'signup' | 'signin' | 'password_reset' | 'resend_confirmation';

/**
 * Safe diagnostics for a failed auth request: which operation, the HTTP
 * status, Supabase's error code, how we classified it, and when. Never the
 * email, password or any token. Visible in Xcode/Console device logs.
 */
export function logAuthFailure(operation: AuthOperation, error: unknown): void {
  const e = (error ?? {}) as { status?: number; code?: string; name?: string };
  console.warn('[auth]', {
    operation,
    status: e.status ?? null,
    code: e.code ?? null,
    name: e.name ?? null,
    kind: parseRateLimit(error)?.kind ?? null,
    at: new Date().toISOString(),
  });
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
    try {
      await request();
      haptics.success();
      return true;
    } catch (e) {
      haptics.error();
      logAuthFailure(operation, e);
      const limit = parseRateLimit(e);
      if (limit) {
        // Lock only for a wait Supabase actually gave; never a made-up one.
        const wait = waitSeconds(limit);
        if (wait !== null) {
          setNow(Date.now());
          setLockedUntil(Date.now() + wait * 1000);
        }
        setError(rateLimitMessage(limit));
      } else {
        setError(toUserMessage(e));
      }
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return { submit, busy, error, secondsLeft, locked: secondsLeft > 0 };
}
