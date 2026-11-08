/**
 * @mentions in comment text (pure, shared by the composer and the thread).
 *
 * The text keeps a readable "@username". The database matches the same
 * tokens (public.mention_tokens): a token starts after a non-name character,
 * so emails don't count, and trailing dots are punctuation.
 */

export const MAX_MENTIONS = 5;

const NAME_CHAR = /[A-Za-z0-9_.]/;
const BEFORE_OK = (ch: string | undefined) => ch === undefined || !/[A-Za-z0-9_.@]/.test(ch);
const USERNAME = /^[a-z0-9_.]{3,24}$/;

export interface MentionToken {
  /** Lowercased username, without "@". */
  username: string;
  /** Index of the "@". */
  start: number;
  /** Index just past the name (trailing dots excluded). */
  end: number;
}

/** Every "@name" in order of appearance (repeats included). */
export function findMentionTokens(text: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || !BEFORE_OK(text[i - 1])) continue;
    let j = i + 1;
    while (j < text.length && NAME_CHAR.test(text[j]!) && j - i <= 30) j++;
    let end = j;
    while (end > i + 1 && text[end - 1] === '.') end--;
    const username = text.slice(i + 1, end).toLowerCase();
    if (USERNAME.test(username) && !(j < text.length && NAME_CHAR.test(text[j]!))) {
      tokens.push({ username, start: i, end });
    }
    i = j - 1;
  }
  return tokens;
}

/**
 * The "@query" being typed at the cursor, if any: an "@" at a word start
 * followed only by name characters up to the cursor.
 */
export function activeMentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  if (cursor < 1 || cursor > text.length) return null;
  let i = cursor - 1;
  while (i >= 0 && NAME_CHAR.test(text[i]!)) i--;
  if (i < 0 || text[i] !== '@' || !BEFORE_OK(text[i - 1])) return null;
  const query = text.slice(i + 1, cursor);
  if (query.length > 24) return null;
  // Keep the panel while the next character continues the same name.
  return { start: i, query };
}

/** Replaces the "@query" at `start…cursor` (and the rest of that word) with "@username ". */
export function insertMention(
  text: string,
  start: number,
  cursor: number,
  username: string,
): { text: string; cursor: number } {
  let end = cursor;
  while (end < text.length && NAME_CHAR.test(text[end]!)) end++;
  const after = text.slice(end);
  const insert = `@${username}${after.startsWith(' ') ? '' : ' '}`;
  const next = text.slice(0, start) + insert + after;
  return { text: next, cursor: start + insert.length + (after.startsWith(' ') ? 1 : 0) };
}

/**
 * Ids to send with the comment: people picked from suggestions whose
 * "@username" is still in the text (so deleting or editing one before
 * sending drops it). First appearance order, at most MAX_MENTIONS.
 */
export function mentionIdsFor(text: string, picked: ReadonlyMap<string, string>, me?: string): string[] {
  const ids: string[] = [];
  for (const token of findMentionTokens(text)) {
    const id = picked.get(token.username);
    if (id && id !== me && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_MENTIONS);
}

/** How many distinct people the text mentions (picked or typed). */
export function distinctMentionCount(text: string): number {
  return new Set(findMentionTokens(text).map((t) => t.username)).size;
}

export interface StoredMention {
  /** The name as written when posted. */
  username: string;
  userId: string;
  /** Their username now (null when hidden from the viewer, e.g. blocked). */
  currentUsername: string | null;
}

export type BodySegment = { kind: 'text'; text: string } | { kind: 'mention'; text: string; userId: string };

/**
 * Splits a body into plain text and mentions. Only names the server stored
 * as mentions link (typed-but-unverified "@x" stays text), and each shows the
 * person's current username so renames don't break the link.
 */
export function segmentBody(body: string, mentions: readonly StoredMention[]): BodySegment[] {
  if (mentions.length === 0 || !body.includes('@')) return body ? [{ kind: 'text', text: body }] : [];
  const byName = new Map(mentions.filter((m) => m.currentUsername).map((m) => [m.username.toLowerCase(), m]));
  const segments: BodySegment[] = [];
  let at = 0;
  for (const token of findMentionTokens(body)) {
    const mention = byName.get(token.username);
    if (!mention) continue;
    if (token.start > at) segments.push({ kind: 'text', text: body.slice(at, token.start) });
    segments.push({ kind: 'mention', text: `@${mention.currentUsername}`, userId: mention.userId });
    at = token.end;
  }
  if (at < body.length) segments.push({ kind: 'text', text: body.slice(at) });
  return segments;
}
