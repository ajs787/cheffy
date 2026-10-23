import { useLocalSearchParams } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/shared/PostGrid';
import { AppHeader, Chip, EmptyState, ErrorState, GridSkeleton } from '@/components/ui';
import { useDiscoverGrid } from '@/features/discover/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import type { DiscoverQueryParams } from '@/lib/query/keys';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

type Sort = DiscoverQueryParams['sort'];

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Latest' },
  { value: 'top', label: 'Top rated' },
  { value: 'loved', label: 'Most loved' },
];

// Budget Eats: price caps use the stored cost per serving (cents).
const BUDGET_SORTS: { value: Sort; label: string }[] = [
  { value: 'top', label: 'Highest rated' },
  { value: 'recent', label: 'Newest' },
  { value: 'cheapest', label: 'Lowest cost' },
];
const PRICE_CAPS: { value: number | null; label: string }[] = [
  { value: null, label: 'All Budget Eats' },
  { value: 300, label: 'Under $3' },
  { value: 500, label: 'Under $5' },
  { value: 1000, label: 'Under $10' },
];

/** A grid of posts for a category, tag, or curated Discover section. */
export default function BrowseScreen() {
  const params = useLocalSearchParams<{
    title?: string;
    primaryId?: string;
    categoryId?: string;
    tagId?: string;
    followingOnly?: string;
    sort?: Sort;
    sinceDays?: string;
    budget?: string;
  }>();
  const budget = params.budget === '1';
  const [sort, setSort] = useState<Sort>(params.sort ?? (budget ? 'top' : 'recent'));
  const [maxCost, setMaxCost] = useState<number | null>(null);
  const query = useDiscoverGrid({
    sort,
    primaryId: params.primaryId ?? null,
    categoryId: params.categoryId ?? null,
    tagId: params.tagId ?? null,
    followingOnly: params.followingOnly === '1',
    sinceDays: params.sinceDays ? Number(params.sinceDays) : null,
    budget,
    maxCostCents: budget ? maxCost : null,
  });
  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  const { refreshing, onRefresh } = usePullToRefresh(() => query.refetch());

  return (
    <View style={styles.screen}>
      <AppHeader title={params.title ?? 'Browse'} />
      {budget ? (
        <View style={styles.sorts}>
          {PRICE_CAPS.map((c) => (
            <Chip
              key={c.label}
              label={c.label}
              size="sm"
              selected={maxCost === c.value}
              onPress={() => setMaxCost(c.value)}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.sorts}>
        {(budget ? BUDGET_SORTS : SORTS).map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            size="sm"
            selected={sort === s.value}
            onPress={() => setSort(s.value)}
          />
        ))}
      </View>
      {query.isPending ? (
        <GridSkeleton count={4} columns={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <PostGrid
          key={`${sort}:${maxCost}`}
          posts={posts}
          empty={
            <EmptyState
              icon={Compass}
              title="Nothing here yet"
              message="When people share posts like this, they’ll show up here."
            />
          }
          loadingMore={query.isFetchingNextPage}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  sorts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: spacing.md,
  },
});
