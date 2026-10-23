import { parseRateLimit, waitSeconds } from './rateLimit';

describe('parseRateLimit', () => {
  it('reads the per-address cooldown and its seconds', () => {
    const limit = parseRateLimit({
      message: 'For security purposes, you can only request this after 37 seconds.',
      code: 'over_email_send_rate_limit',
      status: 429,
    });
    expect(limit).toEqual({ kind: 'cooldown', retryAfterSeconds: 37 });
    expect(waitSeconds(limit!)).toBe(37);
  });

  it('never invents a wait when Supabase gives none', () => {
    expect(waitSeconds({ kind: 'email', retryAfterSeconds: null })).toBeNull();
    expect(waitSeconds({ kind: 'requests', retryAfterSeconds: null })).toBeNull();
  });

  it('recognises the project email quota', () => {
    expect(parseRateLimit({ message: 'email rate limit exceeded', status: 429 })).toEqual({
      kind: 'email',
      retryAfterSeconds: null,
    });
    expect(parseRateLimit({ code: 'over_email_send_rate_limit', message: '' })?.kind).toBe('email');
  });

  it('recognises request throttling', () => {
    expect(parseRateLimit({ status: 429, message: 'Request rate limit reached' })?.kind).toBe('requests');
  });

  it('ignores other errors', () => {
    expect(parseRateLimit({ message: 'Invalid login credentials', status: 400 })).toBeNull();
    expect(parseRateLimit(null)).toBeNull();
  });
});
