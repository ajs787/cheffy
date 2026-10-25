import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from './keys';

/** After creating/editing/deleting a post: everything derived from a user's posts. */
export function invalidateAfterPostChange(qc: QueryClient, authorId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.posts }),
    qc.invalidateQueries({ queryKey: queryKeys.rankingsForUser(authorId) }),
    qc.invalidateQueries({ queryKey: queryKeys.rankingFilters(authorId) }),
    qc.invalidateQueries({ queryKey: queryKeys.profileStats(authorId) }),
    qc.invalidateQueries({ queryKey: queryKeys.trending }),
    qc.invalidateQueries({ queryKey: ['collections'] }),
  ]);
}

/** After follow/unfollow/block: anything that depends on the social graph. */
export function invalidateAfterGraphChange(qc: QueryClient, otherUserId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.feed }),
    qc.invalidateQueries({ queryKey: queryKeys.profile(otherUserId) }),
    qc.invalidateQueries({ queryKey: ['connections'] }),
    qc.invalidateQueries({ queryKey: ['users'] }),
    qc.invalidateQueries({ queryKey: queryKeys.rankingsForUser(otherUserId) }),
    qc.invalidateQueries({ queryKey: ['posts', 'discover'] }),
    qc.invalidateQueries({ queryKey: ['activity'], exact: true }),
  ]);
}
