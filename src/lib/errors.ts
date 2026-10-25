/**
 * Turns Supabase / Postgres / network errors into short, human messages.
 * Raw error text is never shown to users.
 */

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

/**
 * What actually went wrong, so people get an accurate message:
 *  - offline:     the phone has no connection (confirmed by the OS)
 *  - timeout:     the request took too long
 *  - unreachable: the request failed but the phone is online (DNS, TLS, outage)
 *  - unavailable: Supabase answered with a 5xx or Postgres said it's restarting
 *  - email_send:  sign-up couldn't send the confirmation email (5xx from Auth)
 *  - rate_limit:  HTTP 429
 *  - other:       a normal error with its own message (bad password, RLS, …)
 *
 * Note: supabase-js reports *every* 5xx as AuthRetryableFetchError, the same
 * type it uses for a lost connection, so the HTTP status must be checked
 * before calling anything "offline".
 */
export type ErrorKind = 'offline' | 'timeout' | 'unreachable' | 'unavailable' | 'email_send' | 'rate_limit' | 'other';

/** Set by the query client from the OS network state (expo-network). */
let deviceOnline = true;
export function setDeviceOnline(online: boolean): void {
  deviceOnline = online;
}

// Postgres codes for a database that is shutting down, restarting or unreachable.
const DB_UNAVAILABLE = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '08004', '53300']);

export function classifyError(error: unknown): ErrorKind {
  const e = (error ?? {}) as ErrorLike;
  const message = (e.message ?? '').toLowerCase();
  const status = typeof e.status === 'number' ? e.status : undefined;

  if (status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') {
    return 'rate_limit';
  }
  if (message.includes('timed out') || e.name === 'TimeoutError' || e.name === 'AbortError') return 'timeout';
  if (e.code && DB_UNAVAILABLE.has(e.code)) return 'unavailable';
  if (status !== undefined && status >= 500) {
    return /sending (confirmation|magic link|recovery)? ?email|error sending/i.test(e.message ?? '')
      ? 'email_send'
      : 'unavailable';
  }
  const transport =
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('load failed') ||
    (e.name === 'AuthRetryableFetchError' && (status === 0 || status === undefined));
  if (transport) return deviceOnline ? 'unreachable' : 'offline';
  return 'other';
}

/** True for failures worth retrying later (not the request's own fault). */
export function isNetworkError(error: unknown): boolean {
  const kind = classifyError(error);
  return kind === 'offline' || kind === 'timeout' || kind === 'unreachable' || kind === 'unavailable';
}

export const KIND_MESSAGES: Record<Exclude<ErrorKind, 'other'>, string> = {
  offline: 'You’re offline. Check your connection and try again.',
  timeout: 'The request took too long. Please check your connection and try again.',
  unreachable: 'Cheffy is having trouble connecting right now. Please try again shortly.',
  unavailable: 'Cheffy is having trouble connecting right now. Please try again shortly.',
  email_send: 'We couldn’t send your confirmation email right now. Please try again in a few minutes.',
  rate_limit: 'Too many attempts. Please try again later.',
};

const AUTH_MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, 'That email and password don’t match. Try again?'],
  [/email not confirmed/i, 'Check your inbox to confirm your email, then sign in.'],
  [/user already registered/i, 'An account with that email already exists. Try signing in.'],
  [/password should be at least/i, 'Passwords need at least 8 characters.'],
  [/isn.t allowed on Cheffy/i, 'That includes words that aren’t allowed on Cheffy.'],
  [/removed by Cheffy/i, 'This post was removed by Cheffy’s moderators and can’t be republished.'],
  [/same password/i, 'Choose a password different from your current one.'],
  [/weak password|pwned/i, 'That password is too easy to guess. Try a longer one.'],
];

const DB_MESSAGES: [RegExp, string][] = [
  [/profiles_username_key|duplicate key.*username/i, 'That username is taken.'],
  [/profiles_username_format/i, 'Usernames use 3–24 lowercase letters, numbers, dots or underscores.'],
  [/collections_owner_name_key/i, 'You already have a collection with that name.'],
  [/follows_pkey/i, 'You already follow them.'],
  [/follows_no_self_follow/i, 'You can’t follow yourself.'],
  [/at most 6 images/i, 'Posts can have up to 6 photos.'],
  [/at most 10 tags/i, 'Posts can have up to 10 tags.'],
  [/posts_rating_range/i, 'Ratings go from 0.0 to 10.0.'],
  [/posts_recipe_url_format/i, 'Recipe links need to start with http:// or https://.'],
  [/made_on cannot be in the future/i, 'The date made can’t be in the future.'],
  [/post not found/i, 'This post isn’t available anymore.'],
  [/row-level security|permission denied/i, 'You don’t have permission to do that.'],
  [/jwt expired|invalid jwt/i, 'Your session expired. Please sign in again.'],
];

export function toUserMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  const kind = classifyError(error);
  if (kind !== 'other') return KIND_MESSAGES[kind];
  const message = (error as ErrorLike).message ?? String(error);
  for (const [pattern, friendly] of [...AUTH_MESSAGES, ...DB_MESSAGES]) {
    if (pattern.test(message)) return friendly;
  }
  return fallback;
}

/** Throws the Supabase error if present; returns data otherwise. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}
