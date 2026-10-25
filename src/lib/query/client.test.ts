import { retryDelayWithJitter, shouldRetryQuery } from './client';

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

describe('query retries', () => {
  it('never retries rate limits or ordinary errors', () => {
    expect(shouldRetryQuery(0, { status: 429, message: 'rate limit' })).toBe(false);
    expect(shouldRetryQuery(0, { status: 403, message: 'permission denied' })).toBe(false);
  });

  it('backs off briefly while Supabase is unavailable', () => {
    const outage = { name: 'AuthRetryableFetchError', status: 503, message: 'HTTP 503' };
    expect(shouldRetryQuery(0, outage)).toBe(true);
    expect(shouldRetryQuery(1, outage)).toBe(true);
    expect(shouldRetryQuery(2, outage)).toBe(false);
  });

  it('spreads retries out with jitter, capped at 15s', () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const d = retryDelayWithJitter(attempt);
      const cap = Math.min(1000 * 2 ** attempt, 15_000);
      expect(d).toBeGreaterThanOrEqual(cap / 2);
      expect(d).toBeLessThanOrEqual(cap);
    }
  });
});
