import type { NewMember, SuggestedFriend } from './api';
import { isRecentlyJoined, joinedLabel, NEW_REASON, splitDiscoveryPeople } from './newMembers';

const person = (id: string) => ({
  id,
  username: id,
  displayName: id,
  avatarUrl: null,
  viewerIsFollowing: false,
  viewerHasRequested: false,
  isPrivate: false,
});
const suggestion = (id: string, reason: string): SuggestedFriend =>
  ({ ...person(id), reason, mutualCount: 0 }) as SuggestedFriend;
const member = (id: string): NewMember => ({ ...person(id), joinedAt: '2026-10-28T12:00:00Z' }) as NewMember;

describe('splitDiscoveryPeople', () => {
  it('never shows the same person in both rows', () => {
    const { suggested, newcomers } = splitDiscoveryPeople(
      [
        suggestion('mutual', 'Followed by @ana'),
        suggestion('fresh', NEW_REASON),
        suggestion('busy', 'Active on Cheffy'),
      ],
      [member('fresh'), member('mutual'), member('other')],
    );
    expect(suggested.map((s) => s.id)).toEqual(['mutual', 'busy']);
    expect(newcomers.map((n) => n.id)).toEqual(['fresh', 'other']);
    const all = [...suggested, ...newcomers].map((p) => p.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps a "New to Cheffy" suggestion when the New row doesn’t have them', () => {
    const { suggested } = splitDiscoveryPeople([suggestion('fresh', NEW_REASON)], []);
    expect(suggested.map((s) => s.id)).toEqual(['fresh']);
  });
});

describe('joined labels', () => {
  const now = new Date(2026, 9, 29, 9, 0);
  it('says today, yesterday, then the date', () => {
    expect(joinedLabel(new Date(2026, 9, 29, 0, 5).toISOString(), now)).toBe('Joined today');
    expect(joinedLabel(new Date(2026, 9, 28, 23, 50).toISOString(), now)).toBe('Joined yesterday');
    expect(joinedLabel(new Date(2026, 9, 20, 12, 0).toISOString(), now)).toBe('Joined Oct 20');
  });

  it('labels members who joined in the last 14 days as new', () => {
    expect(isRecentlyJoined(new Date(2026, 9, 16, 10, 0).toISOString(), now)).toBe(true);
    expect(isRecentlyJoined(new Date(2026, 9, 14, 8, 0).toISOString(), now)).toBe(false);
    expect(isRecentlyJoined('not a date', now)).toBe(false);
  });
});
