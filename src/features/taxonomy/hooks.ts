import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';

import { fetchClassificationUsage, fetchTaxonomy } from './api';

/** Category reference data. Changes rarely, so it is cached for a day. */
export function useTaxonomy() {
  return useQuery({
    queryKey: queryKeys.taxonomy,
    queryFn: fetchTaxonomy,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

/** How often each classification of a kind is used (for "Common" first). */
export function useClassificationUsage(kind: 'cuisine' | 'subcategory' | 'dish_type') {
  return useQuery({
    queryKey: ['classification-usage', kind],
    queryFn: () => fetchClassificationUsage(kind),
    staleTime: 60 * 60 * 1000,
  });
}
