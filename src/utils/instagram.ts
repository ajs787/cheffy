/**
 * Instagram profile links. People can type a username, "@username" or paste
 * their profile link; we keep only a validated, lowercase username and build
 * the URL ourselves, so nothing user-typed ever becomes a link.
 *
 * Unverified: Cheffy never asks for Instagram credentials and doesn't claim
 * the account belongs to the person.
 */

// Instagram usernames: letters, numbers, periods and underscores, up to 30;
// no leading, trailing or repeated periods.
const USERNAME = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/;

const HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'www.instagr.am',
]);
// First path segments that are Instagram pages, not people.
const RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'explore',
  'stories',
  'accounts',
  'tv',
  'direct',
  'about',
  'developer',
]);

export type InstagramParse = { ok: true; username: string | null } | { ok: false; error: string };

/** Turns what someone typed into a username (null = none), or explains why not. */
export function parseInstagram(input: string): InstagramParse {
  let value = input.trim();
  if (value === '') return { ok: true, username: null };

  const looksLikeLink = /[/:]/.test(value) || /^(www\.|m\.)?instagr(am\.com|\.am)/i.test(value);
  if (looksLikeLink) {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      return { ok: false, error: 'That doesn’t look like an Instagram profile link.' };
    }
    if (!/^https?:$/.test(url.protocol) || !HOSTS.has(url.hostname.toLowerCase())) {
      return { ok: false, error: 'Only instagram.com profile links work here.' };
    }
    const segment = url.pathname.split('/').filter(Boolean)[0] ?? '';
    if (!segment || RESERVED.has(segment.toLowerCase())) {
      return { ok: false, error: 'Paste your profile link, not a post or page.' };
    }
    value = segment;
  }

  const username = value.replace(/^@/, '').toLowerCase();
  if (!USERNAME.test(username)) {
    return {
      ok: false,
      error: 'Instagram usernames use letters, numbers, periods and underscores (30 max).',
    };
  }
  return { ok: true, username };
}

/** The profile URL for a stored username. iOS opens it in the Instagram app when installed. */
export function instagramProfileUrl(username: string): string | null {
  return USERNAME.test(username) ? `https://www.instagram.com/${username}/` : null;
}
