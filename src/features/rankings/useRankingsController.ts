import { useState } from 'react';

import { useTaxonomy } from '@/features/taxonomy/hooks';
import type { RankingFilterOption, RankingSort } from '@/types/models';

import { useRankingFilters, useRankings } from './hooks';

export const SORT_LABELS: Record<RankingSort, string> = {
  highest: 'Highest rated',
  lowest: 'Lowest rated',
  recent: 'Most recent',
  oldest: 'Oldest',
};

/** State + data for a ranked list: primary filter, one secondary filter, sort. */
export function useRankingsController(userId: string | undefined) {
  const taxonomy = useTaxonomy();
  const [primaryId, setPrimaryIdState] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<RankingFilterOption | null>(null);
  const [sort, setSort] = useState<RankingSort>('highest');

  const params = {
    primaryId,
    categoryId: secondary && secondary.kind !== 'tag' ? secondary.id : null,
    tagId: secondary?.kind === 'tag' ? secondary.id : null,
    sort,
  };
  const rankings = useRankings(userId, params);
  const filters = useRankingFilters(userId);

  // Secondary chips relevant to the chosen primary (subcategories belong to one).
  const secondaryOptions = (filters.data ?? []).filter((option) => {
    if (!primaryId) return true;
    if (option.kind !== 'subcategory') return true;
    return taxonomy.data?.byId[option.id]?.parentId === primaryId;
  });

  const setPrimaryId = (id: string | null) => {
    setPrimaryIdState(id);
    if (secondary?.kind === 'subcategory' && id && taxonomy.data?.byId[secondary.id]?.parentId !== id) {
      setSecondary(null);
    }
  };

  const items = rankings.data?.pages.flatMap((page) => page.items) ?? [];
  const total = rankings.data?.pages[0]?.total ?? 0;
  const filtered = !!primaryId || !!secondary;

  return {
    taxonomy,
    rankings,
    items,
    total,
    filtered,
    primaryId,
    setPrimaryId,
    secondary,
    setSecondary,
    secondaryOptions,
    sort,
    setSort,
  };
}

export type RankingsController = ReturnType<typeof useRankingsController>;
