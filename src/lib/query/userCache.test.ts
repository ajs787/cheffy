import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import type { UserListItem } from '@/types/models';

import { queryKeys } from './keys';
import { restoreUserCaches, setFollowStateInUserCaches } from './userCache';

const user = (id: string, following = false): UserListItem => ({
  id,
  username: id,
  displayName: id,
  avatarUrl: null,
  viewerIsFollowing: following,
  viewerHasRequested: false,
  isPrivate: false,
});

describe('user list caches', () => {
  it('flips following everywhere the user appears and rolls back', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.userSearch('au'), [user('a'), user('b')]);
    qc.setQueryData(queryKeys.suggestedCooks, [user('a')]);
    const connections: InfiniteData<UserListItem[]> = { pages: [[user('a'), user('c')]], pageParams: [0] };
    qc.setQueryData(queryKeys.connections('x', 'followers'), connections);

    const snapshot = setFollowStateInUserCaches(qc, 'a', 'following');
    expect(qc.getQueryData<UserListItem[]>(queryKeys.userSearch('au'))![0]!.viewerIsFollowing).toBe(true);
    expect(qc.getQueryData<UserListItem[]>(queryKeys.userSearch('au'))![1]!.viewerIsFollowing).toBe(false);
    expect(qc.getQueryData<UserListItem[]>(queryKeys.suggestedCooks)![0]!.viewerIsFollowing).toBe(true);
    const pages = qc.getQueryData<InfiniteData<UserListItem[]>>(queryKeys.connections('x', 'followers'))!;
    expect(pages.pages[0]![0]!.viewerIsFollowing).toBe(true);

    setFollowStateInUserCaches(qc, 'b', 'requested');
    const b = qc.getQueryData<UserListItem[]>(queryKeys.userSearch('au'))![1]!;
    expect([b.viewerIsFollowing, b.viewerHasRequested]).toEqual([false, true]);

    restoreUserCaches(qc, snapshot);
    expect(qc.getQueryData<UserListItem[]>(queryKeys.suggestedCooks)![0]!.viewerIsFollowing).toBe(false);
  });

  it('updates the actor of Activity rows and leaves the unread count alone', () => {
    const qc = new QueryClient();
    qc.setQueryData(
      ['activity'],
      [
        { id: 'n1', actor: user('a') },
        { id: 'n2', actor: user('b') },
      ],
    );
    qc.setQueryData(['activity', 'unread'], 3);

    const snapshot = setFollowStateInUserCaches(qc, 'a', 'requested');
    const rows = qc.getQueryData<{ actor: UserListItem }[]>(['activity'])!;
    expect([rows[0]!.actor.viewerIsFollowing, rows[0]!.actor.viewerHasRequested]).toEqual([false, true]);
    expect(rows[1]!.actor.viewerHasRequested).toBe(false);
    expect(qc.getQueryData(['activity', 'unread'])).toBe(3);

    restoreUserCaches(qc, snapshot);
    expect(qc.getQueryData<{ actor: UserListItem }[]>(['activity'])![0]!.actor.viewerHasRequested).toBe(
      false,
    );
  });
});
