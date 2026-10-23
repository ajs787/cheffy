import { useEffect, useRef, useState } from 'react';

import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';

import { parseRateLimit, rateLimitMessage, waitSeconds } from './rateLimit';

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

  const submit = async (request: () => Promise<void>): Promise<boolean> => {
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
      const limit = parseRateLimit(e);
      if (limit) {
        const until = Date.now() + waitSeconds(limit) * 1000;
        setNow(Date.now());
        setLockedUntil(until);
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
