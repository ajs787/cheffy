/**
 * fetch with a time limit, so a stalled connection ends in a clear "took too
 * long" error instead of a spinner that never stops. Uploads and server-side
 * jobs (photo uploads, account deletion) get longer limits.
 */
export const DEFAULT_TIMEOUT_MS = 20_000;
export const LONG_TIMEOUT_MS = 120_000;

export function timeoutFor(url: string, method: string): number {
  const upload = url.includes('/storage/v1/object') && method !== 'GET' && method !== 'HEAD';
  const slowJob = url.includes('/functions/v1/');
  return upload || slowJob ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

export class TimeoutError extends Error {
  override name = 'TimeoutError';
  constructor() {
    super('Request timed out');
  }
}

export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutFor(url, method));
  // Respect a caller's own abort signal too.
  init?.signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !init?.signal?.aborted) throw new TimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
