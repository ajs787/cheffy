/** Seconds to wait between confirmation emails (Supabase enforces its own limit too). */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Whole seconds left before another email may be sent; 0 when ready. */
export function cooldownLeft(sentAt: number | null, now: number, seconds = RESEND_COOLDOWN_SECONDS): number {
  if (sentAt === null) return 0;
  return Math.max(0, Math.ceil((sentAt + seconds * 1000 - now) / 1000));
}

/** What the callback screen shows for the parameters an email link opened it with. */
export type CallbackOutcome =
  | { kind: 'exchange'; code: string; recovery: boolean }
  | { kind: 'expired' }
  | { kind: 'invalid'; message: string };

export function callbackOutcome(params: {
  code?: string;
  type?: string;
  error_code?: string;
  error_description?: string;
}): CallbackOutcome {
  if (params.error_code === 'otp_expired') return { kind: 'expired' };
  if (params.error_description || params.error_code) {
    return { kind: 'invalid', message: params.error_description ?? 'This link didn’t work.' };
  }
  if (params.code) return { kind: 'exchange', code: params.code, recovery: params.type === 'recovery' };
  return { kind: 'invalid', message: 'This link is incomplete or has already been used.' };
}
