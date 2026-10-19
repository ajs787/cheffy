import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ListFooter } from '@/components/shared/ListFooter';
import { PostGridItem } from '@/components/shared/PostGridItem';
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
  const { width } = useWindowDimensions();
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
  const cardWidth = (width - SCREEN_GUTTER * 2 - spacing.md) / 2;
  const { refreshing, onRefresh } = usePullToRefresh(() => query.refetch());

  return (
    <View style={styles.screen}>
      <AppHeader title={params.title ?? 'Browse'} />
      <View style={styles.sorts}>
        {SORTS.map((s) => (
          <Chip key={s.value} label={s.label} size="sm" selected={sort === s.value} onPress={() => setSort(s.value)} />
        ))}
      </View>
      {query.isPending ? (
        <GridSkeleton count={4} columns={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlashList
          key={sort}
          data={posts}
          numColumns={2}
          keyExtractor={(post) => post.id}
          renderItem={({ item, index }) => (
            <View style={[styles.cell, index % 2 === 0 ? styles.cellLeft : styles.cellRight]}>
              <PostGridItem post={item} size={cardWidth} variant="card" />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState icon={Compass} title="Nothing here yet" message="When people share posts like this, they’ll show up here." />
          }
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
          contentContainerStyle={styles.content}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  sorts: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: SCREEN_GUTTER, paddingBottom: spacing.md },
  content: { paddingTop: spacing.xs },
  cell: { paddingBottom: spacing.lg },
  cellLeft: { paddingLeft: SCREEN_GUTTER, paddingRight: spacing.md / 2 },
  cellRight: { paddingRight: SCREEN_GUTTER, paddingLeft: spacing.md / 2 },
});
