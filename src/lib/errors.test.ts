import { classifyError, setDeviceOnline, toUserMessage } from './errors';

// Shapes as supabase-js produces them.
const retryable = (status: number, message = `HTTP ${status}`) => ({ name: 'AuthRetryableFetchError', status, message });

afterEach(() => setDeviceOnline(true));

describe('classifyError', () => {
  it('only says offline when the phone is actually offline', () => {
    const lost = retryable(0, 'Network request failed');
    setDeviceOnline(false);
    expect(classifyError(lost)).toBe('offline');
    setDeviceOnline(true);
    expect(classifyError(lost)).toBe('unreachable');
  });

  it('treats Supabase 5xx as the server, not the phone', () => {
    expect(classifyError(retryable(503))).toBe('unavailable');
    expect(classifyError(retryable(502))).toBe('unavailable');
    expect(toUserMessage(retryable(503))).toMatch(/having trouble connecting/);
    expect(toUserMessage(retryable(503))).not.toMatch(/offline/i);
  });

  it('recognises a failed confirmation email', () => {
    expect(classifyError(retryable(500, 'Error sending confirmation email'))).toBe('email_send');
  });

  it('recognises a restarting database', () => {
    expect(classifyError({ code: '57P03', message: 'the database system is shutting down' })).toBe('unavailable');
    expect(classifyError({ code: '57P01', message: 'terminating connection due to administrator command' })).toBe(
      'unavailable',
    );
  });

  it('separates rate limits and timeouts', () => {
    expect(classifyError({ status: 429, message: 'Request rate limit reached' })).toBe('rate_limit');
    expect(classifyError(retryable(0, 'Request timed out'))).toBe('timeout');
  });

  it('leaves ordinary errors to their own messages', () => {
    expect(classifyError({ status: 400, message: 'Invalid login credentials' })).toBe('other');
    expect(toUserMessage({ status: 400, message: 'Invalid login credentials' })).toMatch(/don’t match/);
  });
});
