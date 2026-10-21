import { callbackOutcome, cooldownLeft } from './cooldown';

describe('cooldownLeft', () => {
  it('is ready when nothing was sent', () => expect(cooldownLeft(null, 1000)).toBe(0));
  it('counts down whole seconds', () => {
    expect(cooldownLeft(0, 0)).toBe(60);
    expect(cooldownLeft(0, 59_001)).toBe(1);
    expect(cooldownLeft(0, 60_000)).toBe(0);
  });
});

describe('callbackOutcome', () => {
  it('recognises expired links', () =>
    expect(callbackOutcome({ error_code: 'otp_expired', error_description: 'Email link is invalid or has expired' })).toEqual({
      kind: 'expired',
    }));
  it('passes other errors through', () =>
    expect(callbackOutcome({ error_description: 'Nope' })).toEqual({ kind: 'invalid', message: 'Nope' }));
  it('exchanges a code', () =>
    expect(callbackOutcome({ code: 'abc', type: 'recovery' })).toEqual({ kind: 'exchange', code: 'abc', recovery: true }));
  it('treats a bare link as invalid', () => expect(callbackOutcome({}).kind).toBe('invalid'));
});
