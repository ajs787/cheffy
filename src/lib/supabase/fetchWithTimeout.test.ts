import { DEFAULT_TIMEOUT_MS, fetchWithTimeout, LONG_TIMEOUT_MS, timeoutFor } from './fetchWithTimeout';

describe('timeoutFor', () => {
  it('gives uploads and server jobs longer', () => {
    expect(timeoutFor('https://x.supabase.co/rest/v1/posts', 'GET')).toBe(DEFAULT_TIMEOUT_MS);
    expect(timeoutFor('https://x.supabase.co/auth/v1/signup', 'POST')).toBe(DEFAULT_TIMEOUT_MS);
    expect(timeoutFor('https://x.supabase.co/storage/v1/object/post-images/a.jpg', 'POST')).toBe(LONG_TIMEOUT_MS);
    expect(timeoutFor('https://x.supabase.co/functions/v1/delete-account', 'POST')).toBe(LONG_TIMEOUT_MS);
  });
});

describe('fetchWithTimeout', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('turns a stalled request into a TimeoutError', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_input, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as typeof fetch;
    const pending = fetchWithTimeout('https://x.supabase.co/rest/v1/posts');
    jest.advanceTimersByTime(DEFAULT_TIMEOUT_MS + 1);
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError', message: 'Request timed out' });
  });

  it('passes normal responses through', async () => {
    global.fetch = jest.fn(async () => new Response('ok')) as typeof fetch;
    await expect((await fetchWithTimeout('https://x.supabase.co/rest/v1/posts')).text()).resolves.toBe('ok');
  });
});
