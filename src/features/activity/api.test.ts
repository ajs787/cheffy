import type { ActivityItem } from './api';
import { hasUnread } from './api';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const actor = { id: 'u', username: 'u', displayName: 'U', avatarUrl: null };
const item = (at: string): ActivityItem => ({ kind: 'follow', key: at, at, actor, viewerIsFollowing: false, viewerHasRequested: false, actorIsPrivate: false });

describe('hasUnread', () => {
  it('is unread when the newest item is after the last visit', () => {
    expect(hasUnread([item('2026-10-20T10:00:00Z')], '2026-10-20T09:00:00Z')).toBe(true);
    expect(hasUnread([item('2026-10-20T08:00:00Z')], '2026-10-20T09:00:00Z')).toBe(false);
  });

  it('treats a never-opened inbox with items as unread, and an empty one as read', () => {
    expect(hasUnread([item('2026-10-20T08:00:00Z')], null)).toBe(true);
    expect(hasUnread([], null)).toBe(false);
  });
});
