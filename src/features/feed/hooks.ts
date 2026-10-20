import { useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import type { Cursor } from '@/types/models';

import { fetchFollowingPage, fetchForYouPage, type FeedMode } from './api';

export function useFeed(mode: FeedMode) {
  return useInfiniteQuery({
    queryKey: mode === 'following' ? queryKeys.feed : queryKeys.forYou,
    queryFn: ({ pageParam }) => (mode === 'following' ? fetchFollowingPage(pageParam) : fetchForYouPage(pageParam)),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}
