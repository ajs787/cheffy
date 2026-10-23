/**
 * Supabase Auth rate-limit errors, told apart so people get an honest
 * message and a real wait time instead of a generic "too many attempts":
 *
 *  - `email`    — the project's email-sending quota is used up
 *                 ("email rate limit exceeded", code over_email_send_rate_limit).
 *                 Affects everyone; the fix is custom SMTP (see PROGRESS.md).
 *  - `cooldown` — the same address asked again too soon
 *                 ("For security purposes, you can only request this after 37 seconds.").
 *  - `requests` — too many sign-in/sign-up requests from this network (HTTP 429).
 */
export interface RateLimit {
  kind: 'email' | 'cooldown' | 'requests';
  /** Seconds to wait, when Supabase says. */
  retryAfterSeconds: number | null;
}

interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

export function parseRateLimit(error: unknown): RateLimit | null {
  const e = (error ?? {}) as AuthErrorLike;
  const message = e.message ?? '';
  const seconds = /after (\d+) seconds?/i.exec(message);
  if (seconds) return { kind: 'cooldown', retryAfterSeconds: Number(seconds[1]) };
  if (e.code === 'over_email_send_rate_limit' || /email rate limit/i.test(message)) {
    return { kind: 'email', retryAfterSeconds: null };
  }
  if (
    e.status === 429 ||
    e.code === 'over_request_rate_limit' ||
    /rate limit|too many requests/i.test(message)
  ) {
    return { kind: 'requests', retryAfterSeconds: null };
  }
  return null;
}

/**
 * Seconds to lock the form after a rate-limit response — only when Supabase
 * said how long. We never invent a wait: without one the button stays usable
 * and the message explains what happened.
 */
export function waitSeconds(limit: RateLimit): number | null {
  return limit.retryAfterSeconds === null ? null : Math.max(1, limit.retryAfterSeconds);
}

export function rateLimitMessage(limit: RateLimit): string {
  switch (limit.kind) {
    case 'cooldown':
      return 'We just sent you an email. Check your inbox (and spam) before asking for another.';
    case 'email':
      return 'Cheffy couldn’t send a confirmation email right now because too many have gone out recently. Your details are still here — please try again later.';
    case 'requests':
      return 'Too many sign-in attempts from this network. Please try again shortly.';
  }
}
