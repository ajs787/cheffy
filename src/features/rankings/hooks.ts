import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys, type RankingQueryParams } from '@/lib/query/keys';

import { fetchRankingFilters, fetchRankingsPage, fetchRatingSummary } from './api';

export function useRankings(userId: string | undefined, params: RankingQueryParams) {
  return useInfiniteQuery({
    queryKey: queryKeys.rankings(userId ?? '', params),
    queryFn: ({ pageParam }) => fetchRankingsPage(userId!, params, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: !!userId,
    placeholderData: (previous) => previous,
  });
}

export function useRankingFilters(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rankingFilters(userId ?? ''),
    queryFn: () => fetchRankingFilters(userId!),
    enabled: !!userId,
  });
}

export function useRatingSummary(userId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.rankingsForUser(userId ?? ''), 'summary'],
    queryFn: () => fetchRatingSummary(userId!),
    enabled: !!userId,
  });
}
