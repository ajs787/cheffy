import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys, type DiscoverQueryParams } from '@/lib/query/keys';
import type { Cursor } from '@/types/models';

import { fetchDiscoverPage, fetchTrending, searchPosts, searchTags, type DiscoverPageParam } from './api';

/** First page only — for horizontal Discover sections. */
export function useDiscoverSection(params: DiscoverQueryParams, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.discover(params), 'section'],
    queryFn: async () => (await fetchDiscoverPage(params, null, 10)).items,
    enabled,
    staleTime: 2 * 60_000,
  });
}

/** Infinite grid for "See all" / browse screens. */
export function useDiscoverGrid(params: DiscoverQueryParams) {
  return useInfiniteQuery({
    queryKey: queryKeys.discover(params),
    queryFn: ({ pageParam }) => fetchDiscoverPage(params, pageParam),
    initialPageParam: null as DiscoverPageParam,
    getNextPageParam: (last) => last.nextPageParam ?? undefined,
  });
}

export function useTrending() {
  return useQuery({ queryKey: queryKeys.trending, queryFn: fetchTrending, staleTime: 5 * 60_000 });
}

export function usePostSearch(query: string) {
  const q = query.trim().toLowerCase();
  return useInfiniteQuery({
    queryKey: queryKeys.postSearch(q),
    queryFn: ({ pageParam }) => searchPosts(q, pageParam),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
}

export function useTagSearch(query: string) {
  const q = query.trim().toLowerCase();
  return useQuery({
    queryKey: queryKeys.tagSuggestions(q),
    queryFn: () => searchTags(q),
    enabled: q.length >= 1,
    staleTime: 60_000,
  });
}
