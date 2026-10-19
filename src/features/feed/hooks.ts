import { useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import type { Cursor } from '@/types/models';

import { fetchFeedPage } from './api';

export function useFeed() {
  return useInfiniteQuery({
    queryKey: queryKeys.feed,
    queryFn: ({ pageParam }) => fetchFeedPage(pageParam),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}
