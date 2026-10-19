import { router } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/shared/PostGrid';
import { AppHeader, AppText, EmptyState, ErrorState, GridSkeleton } from '@/components/ui';
import { useSavedPosts } from '@/features/collections/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

export default function SavedScreen() {
  const saved = useSavedPosts();
  const posts = saved.data?.pages.flatMap((page) => page.items) ?? [];
  const { refreshing, onRefresh } = usePullToRefresh(() => saved.refetch());

  return (
    <View style={styles.screen}>
      <AppHeader title="Want to make" />
      {saved.isPending ? (
        <GridSkeleton count={4} columns={2} />
      ) : saved.isError ? (
        <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
      ) : (
        <PostGrid
          posts={posts}
          header={
            <AppText variant="callout" color="textSecondary" style={styles.note}>
              Only you can see what you’ve saved.
            </AppText>
          }
          empty={
            <EmptyState
              icon={Bookmark}
              title="Nothing saved yet"
              message="Tap the bookmark on a post to keep it here for the next time you’re deciding what to make."
              actionLabel="Explore"
              onAction={() => router.push('/discover')}
            />
          }
          loadingMore={saved.isFetchingNextPage}
          onEndReached={() => {
            if (saved.hasNextPage && !saved.isFetchingNextPage) void saved.fetchNextPage();
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
  note: { paddingHorizontal: SCREEN_GUTTER, paddingBottom: spacing.lg },
});
