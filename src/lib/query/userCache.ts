import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { UserListItem } from '@/types/models';

type UserCacheShape = UserListItem[] | InfiniteData<UserListItem[]> | undefined;

/** Cached user lists: search and suggestions (['users', …]) and follower lists (['connections', …]). */
const USER_LIST_ROOTS: QueryKey[] = [['users'], ['connections']];

function mapUsers(data: UserCacheShape, fn: (user: UserListItem) => UserListItem): UserCacheShape {
  if (!data) return data;
  if (Array.isArray(data)) return data.map(fn);
  if ('pages' in data) return { ...data, pages: data.pages.map((page) => page.map(fn)) };
  return data;
}

export type UserCacheSnapshot = [QueryKey, UserCacheShape][];

/** Optimistically flips "following" for one user in every cached list; returns a snapshot for rollback. */
export function setFollowingInUserCaches(qc: QueryClient, userId: string, following: boolean): UserCacheSnapshot {
  const snapshot: UserCacheSnapshot = [];
  for (const root of USER_LIST_ROOTS) {
    for (const [key, data] of qc.getQueriesData<UserCacheShape>({ queryKey: root })) {
      snapshot.push([key, data]);
      qc.setQueryData(
        key,
        mapUsers(data, (user) => (user.id === userId ? { ...user, viewerIsFollowing: following } : user)),
      );
    }
  }
  return snapshot;
}

export function restoreUserCaches(qc: QueryClient, snapshot: UserCacheSnapshot): void {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}
