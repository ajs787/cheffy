import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { ListOrdered, SearchX } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ListFooter } from '@/components/shared/ListFooter';
import { RankingRow } from '@/components/shared/RankingRow';
import { AppHeader, EmptyState, ErrorState, RowSkeleton, SegmentedControl } from '@/components/ui';
import { FriendsRankings } from '@/features/rankings/components/FriendsRankings';
import { useUserId } from '@/features/auth/store';
import { RankingFilters } from '@/features/rankings/components/RankingFilters';
import { RankingSummary } from '@/features/rankings/components/RankingSummary';
import { useRankingsController } from '@/features/rankings/useRankingsController';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useTabScrollToTop } from '@/hooks/useTabScrollToTop';
import type { RankingItem } from '@/types/models';
import { colors, spacing } from '@/theme';

const VIEWS = [
  { value: 'mine', label: 'Mine' },
  { value: 'friends', label: 'Friends' },
] as const;

export default function RankingsScreen() {
  const me = useUserId();
  const controller = useRankingsController(me ?? undefined);
  const { rankings, items, filtered } = controller;
  const listRef = useTabScrollToTop<RankingItem>();
  const { refreshing, onRefresh } = usePullToRefresh(() => rankings.refetch());

  const [view, setView] = useState<'mine' | 'friends'>('mine');
  // The list's visible height minus the header: where an empty state centres.
  const [listHeight, setListHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const centered = (child: ReactNode) => (
    <View style={[styles.emptyArea, { minHeight: Math.max(0, listHeight - headerHeight) }]}>{child}</View>
  );
  const switcher = <SegmentedControl options={VIEWS} value={view} onChange={setView} />;

  return (
    <View style={styles.screen}>
      <AppHeader variant="large" title={view === 'mine' ? 'My Rankings' : 'Friends’ Rankings'} />
      {view === 'friends' ? (
        <FriendsRankings header={switcher} />
      ) : (
        <FlashList
          data={items}
          ref={listRef}
          keyExtractor={(item) => item.postId}
          renderItem={({ item }) => <RankingRow item={item} />}
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
          ListHeaderComponent={
            // One structure for every data state: the body's top padding and
            // gap set all spacing under the tabs; children add no margins.
            <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
              {switcher}
              <View style={styles.headerBody}>
                {me ? <RankingSummary userId={me} /> : null}
                {/* Sorting gets its own row under the filters, never beside the title. */}
                <RankingFilters controller={controller} />
              </View>
            </View>
          }
          ListEmptyComponent={
            rankings.isPending ? (
              <RowSkeleton />
            ) : rankings.isError ? (
              centered(<ErrorState error={rankings.error} onRetry={() => void rankings.refetch()} />)
            ) : filtered ? (
              centered(
                <EmptyState
                  icon={SearchX}
                  compact
                  title="Nothing here yet"
                  message="Nothing you’ve made matches these filters."
                />,
              )
            ) : (
              centered(
                <EmptyState
                  icon={ListOrdered}
                  compact
                  title="Your rankings start here"
                  message="Everything you rate lands in your personal ranking, best first."
                  actionLabel="Log something you made"
                  onAction={() => router.push('/compose')}
                />,
              )
            )
          }
          ListFooterComponent={<ListFooter loading={rankings.isFetchingNextPage} />}
          onEndReached={() => {
            if (rankings.hasNextPage && !rankings.isFetchingNextPage) void rankings.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerBody: { paddingTop: spacing.xl, paddingBottom: spacing.sm, gap: spacing.lg },
  // Centres the empty state in the space left under the header.
  emptyArea: { justifyContent: 'center', paddingBottom: spacing.xxl },
});
