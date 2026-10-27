import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/shared/PostGrid';
import { AppHeader, AppText, EmptyState, ErrorState, GridSkeleton } from '@/components/ui';
import { TopicChips } from '@/features/discover/components/ForYourTaste';
import { useTasteGrid, useTasteTopics } from '@/features/discover/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

/** "See all" for For Your Taste: topics to explore, then every pick, paged. */
export default function TasteScreen() {
  const topics = useTasteTopics();
  const grid = useTasteGrid();
  const posts = grid.data?.pages.flatMap((page) => page.items) ?? [];
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([grid.refetch(), topics.refetch()]),
  );

  const header = (
    <View style={styles.header}>
      {(topics.data?.length ?? 0) > 0 ? (
        <>
          <AppText variant="overline" color="textSecondary" style={styles.label}>
            Explore by tag
          </AppText>
          <TopicChips topics={topics.data ?? []} />
        </>
      ) : null}
      <AppText variant="overline" color="textSecondary" style={styles.label}>
        Creations for you
      </AppText>
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader title="For Your Taste" />
      <PostGrid
        posts={posts}
        header={header}
        empty={
          grid.isPending ? (
            <GridSkeleton count={4} columns={2} />
          ) : grid.isError ? (
            <ErrorState error={grid.error} onRetry={() => void grid.refetch()} />
          ) : (
            <EmptyState
              icon={Sparkles}
              compact
              title="Nothing new to suggest"
              message="You’ve seen everything that matches your taste for now."
              actionLabel="Browse Discover"
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
  header: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  label: { paddingHorizontal: SCREEN_GUTTER, paddingBottom: spacing.sm },
});
