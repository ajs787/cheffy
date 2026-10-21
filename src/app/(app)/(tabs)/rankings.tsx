import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { ListOrdered, SearchX } from 'lucide-react-native';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ListFooter } from '@/components/shared/ListFooter';
import { RankingRow } from '@/components/shared/RankingRow';
import { AppHeader, EmptyState, ErrorState, RowSkeleton } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { RankingFilters } from '@/features/rankings/components/RankingFilters';
import { RankingSummary } from '@/features/rankings/components/RankingSummary';
import { useRankingsController } from '@/features/rankings/useRankingsController';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useTabScrollToTop } from '@/hooks/useTabScrollToTop';
import type { RankingItem } from '@/types/models';
import { colors, spacing } from '@/theme';

export default function RankingsScreen() {
  const me = useUserId();
  const controller = useRankingsController(me ?? undefined);
  const { rankings, items, filtered } = controller;
  const listRef = useTabScrollToTop<RankingItem>();
  const { refreshing, onRefresh } = usePullToRefresh(() => rankings.refetch());

  return (
    <View style={styles.screen}>
      <AppHeader variant="large" title="My Rankings" />
      <FlashList
        data={items}
        ref={listRef}
        keyExtractor={(item) => item.postId}
        renderItem={({ item }) => <RankingRow item={item} />}
        ListHeaderComponent={
          <View>
            {me ? <RankingSummary userId={me} /> : null}
            {/* Sorting gets its own row under the filters, never beside the title. */}
            <RankingFilters controller={controller} />
            <View style={styles.listTop} />
          </View>
        }
        ListEmptyComponent={
          rankings.isPending ? (
            <RowSkeleton />
          ) : rankings.isError ? (
            <ErrorState error={rankings.error} onRetry={() => void rankings.refetch()} />
          ) : filtered ? (
            <EmptyState icon={SearchX} compact title="Nothing here yet" message="Nothing you’ve made matches these filters." />
          ) : (
            <EmptyState
              icon={ListOrdered}
              title="Your rankings start here"
              message="Everything you rate lands in your personal ranking, best first."
              actionLabel="Log something you made"
              onAction={() => router.push('/compose')}
            />
          )
        }
        ListFooterComponent={<ListFooter loading={rankings.isFetchingNextPage} />}
        onEndReached={() => {
          if (rankings.hasNextPage && !rankings.isFetchingNextPage) void rankings.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  listTop: { height: spacing.sm },
});
