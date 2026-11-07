import { formatCalendarDate } from '@/utils/dates';

import type { NewMember, SuggestedFriend } from './api';

/** Joined within this many days: shows the "New" label. */
export const NEW_LABEL_DAYS = 14;
const DAY_MS = 86_400_000;

export function isRecentlyJoined(joinedAt: string, now: Date = new Date()): boolean {
  const t = Date.parse(joinedAt);
  return Number.isFinite(t) && now.getTime() - t < NEW_LABEL_DAYS * DAY_MS;
}

/** "Joined today", "Joined yesterday", or "Joined Oct 27" (local calendar days). */
export function joinedLabel(joinedAt: string, now: Date = new Date()): string {
  const d = new Date(joinedAt);
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / DAY_MS;
  const ago = day(now) - day(d);
  if (ago <= 0) return 'Joined today';
  if (ago === 1) return 'Joined yesterday';
  return `Joined ${formatCalendarDate(d, now)}`;
}

/** The reason suggested_friends gives someone suggested only for being new. */
export const NEW_REASON = 'New to Cheffy';

/**
 * Splits people for a screen that shows both "Suggested for you" and "New to
 * Cheffy", so nobody appears twice: someone suggested for a stronger reason
 * (a mutual friend, follows you, …) stays in Suggested; someone suggested only
 * for being new appears in the New row instead.
 */
export function splitDiscoveryPeople(
  suggested: readonly SuggestedFriend[],
  newcomers: readonly NewMember[],
): { suggested: SuggestedFriend[]; newcomers: NewMember[] } {
  const strong = new Set(suggested.filter((s) => s.reason !== NEW_REASON).map((s) => s.id));
  const shownNew = newcomers.filter((n) => !strong.has(n.id));
  const newIds = new Set(shownNew.map((n) => n.id));
  return {
    suggested: suggested.filter((s) => s.reason !== NEW_REASON || !newIds.has(s.id)),
    newcomers: shownNew,
  };
}
