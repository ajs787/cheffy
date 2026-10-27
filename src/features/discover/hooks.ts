import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys, type DiscoverQueryParams } from '@/lib/query/keys';

import {
  fetchDiscoverPage,
  fetchMostHated,
  fetchTastePosts,
  fetchTasteTopics,
  fetchTrending,
  searchPosts,
  searchTags,
  type DiscoverPageParam,
} from './api';

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

export function useMostHated() {
  return useQuery({ queryKey: queryKeys.mostHated, queryFn: fetchMostHated, staleTime: 10 * 60_000 });
}

export function useTrending() {
  return useQuery({ queryKey: queryKeys.trending, queryFn: fetchTrending, staleTime: 5 * 60_000 });
}

export function usePostSearch(query: string) {
  const q = query.trim().toLowerCase();
  return useInfiniteQuery({
    queryKey: queryKeys.postSearch(q),
    queryFn: ({ pageParam }) => searchPosts(q, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
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

// For Your Taste changes slowly (and has a daily shuffle), so it isn't
// refetched on every visit to Discover.
const TASTE_STALE_MS = 10 * 60_000;

export function useTasteTopics() {
  return useQuery({ queryKey: queryKeys.tasteTopics, queryFn: () => fetchTasteTopics(), staleTime: TASTE_STALE_MS });
}

/** The Discover carousel: the first few picks. */
export function useTasteSection() {
  return useQuery({
    queryKey: queryKeys.tastePosts,
    queryFn: async () => (await fetchTastePosts(0, 10)).items,
    staleTime: TASTE_STALE_MS,
  });
}

/** "See all": every pick, paged. */
export function useTasteGrid() {
  return useInfiniteQuery({
    queryKey: queryKeys.tastePostsAll,
    queryFn: ({ pageParam }) => fetchTastePosts(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: TASTE_STALE_MS,
  });
}
