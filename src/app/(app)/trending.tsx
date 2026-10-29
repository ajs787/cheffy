import { router } from 'expo-router';
import { Flame } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/shared/PostGrid';
import { AppHeader, AppText, EmptyState, ErrorState, GridSkeleton } from '@/components/ui';
import { useTrendingCreations } from '@/features/discover/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

/** "See all" for Search's Trending row: every trending creation, paged. */
export default function TrendingScreen() {
  const grid = useTrendingCreations();
  const posts = grid.data?.pages.flatMap((page) => page.items) ?? [];
  const { refreshing, onRefresh } = usePullToRefresh(() => grid.refetch());

  return (
    <View style={styles.screen}>
      <AppHeader title="Trending" />
      <PostGrid
        posts={posts}
        header={
          <AppText variant="caption" color="textSecondary" style={styles.note}>
            Ranked by likes and comments from the last two weeks.
          </AppText>
        }
        empty={
          grid.isPending ? (
            <GridSkeleton count={4} columns={2} />
          ) : grid.isError ? (
            <ErrorState error={grid.error} onRetry={() => void grid.refetch()} />
          ) : (
            <EmptyState
              icon={Flame}
              compact
              title="Nothing trending yet"
              message="Creations people like and comment on this week show up here."
              actionLabel="Back to Search"
              onAction={() => router.back()}
            />
          )
        }
        loadingMore={grid.isFetchingNextPage}
        onEndReached={() => {
          if (grid.hasNextPage && !grid.isFetchingNextPage) void grid.fetchNextPage();
        }}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  note: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
