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

export function isNetworkError(error: unknown): boolean {
  const e = error as ErrorLike | null;
  const message = e?.message?.toLowerCase() ?? '';
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('timed out') ||
    e?.name === 'AuthRetryableFetchError'
  );
}

const AUTH_MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, 'That email and password don’t match. Try again?'],
  [/email not confirmed/i, 'Check your inbox to confirm your email, then sign in.'],
  [/user already registered/i, 'An account with that email already exists. Try signing in.'],
  [/password should be at least/i, 'Passwords need at least 8 characters.'],
  [/rate limit|too many requests/i, 'Too many attempts. Please wait a minute and try again.'],
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
  if (isNetworkError(error)) return 'You seem to be offline. Check your connection and try again.';
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
