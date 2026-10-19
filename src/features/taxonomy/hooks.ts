import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';

import { fetchTaxonomy } from './api';

/** Category reference data. Changes rarely, so it is cached for a day. */
export function useTaxonomy() {
  return useQuery({
    queryKey: queryKeys.taxonomy,
    queryFn: fetchTaxonomy,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
