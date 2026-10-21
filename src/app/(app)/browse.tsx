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
  }>();
  const [sort, setSort] = useState<Sort>(params.sort ?? 'recent');
  const query = useDiscoverGrid({
    sort,
    primaryId: params.primaryId ?? null,
    categoryId: params.categoryId ?? null,
    tagId: params.tagId ?? null,
    followingOnly: params.followingOnly === '1',
    sinceDays: params.sinceDays ? Number(params.sinceDays) : null,
  });
  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  const { refreshing, onRefresh } = usePullToRefresh(() => query.refetch());

  return (
    <View style={styles.screen}>
      <AppHeader title={params.title ?? 'Browse'} />
      <View style={styles.sorts}>
        {SORTS.map((s) => (
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
          key={sort}
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
    gap: spacing.sm,
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: spacing.md,
  },
});
