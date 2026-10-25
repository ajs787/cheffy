import { FlashList } from '@shopify/flash-list';
import { Users, X } from 'lucide-react-native';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { UserRow } from '@/components/shared/UserRow';
import { AppHeader, AppText, EmptyState, ErrorState, RowSkeleton } from '@/components/ui';
import { useAllSuggestedFriends, useDismissSuggestion } from '@/features/social/hooks';
import { useRecentPeople } from '@/features/social/recentPeople';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';

/** Every suggestion, paged, each with the real reason it's shown. */
export default function SuggestedScreen() {
  const list = useAllSuggestedFriends();
  const dismiss = useDismissSuggestion();
  const recents = useRecentPeople();
  const { refreshing, onRefresh } = usePullToRefresh(() => list.refetch());
  const people = list.data?.pages.flat() ?? [];

  return (
    <View style={styles.screen}>
      <AppHeader title="Suggested for you" />
      {list.isPending ? (
        <RowSkeleton count={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          data={people}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <View>
              <UserRow user={item} onOpen={recents.add} />
              <View style={styles.reasonRow}>
                <AppText variant="caption" color="textTertiary" style={styles.reason} numberOfLines={1}>
                  {item.reason}
                </AppText>
                <Pressable
                  onPress={() => dismiss.mutate(item.id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Don’t suggest ${item.displayName}`}
                  style={styles.dismiss}
                >
                  <X size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
                  <AppText variant="caption" color="textTertiary">
                    Not interested
                  </AppText>
                </Pressable>
              </View>
            </View>
          )}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              compact
              title="No suggestions right now"
              message="Follow a few people or log what you make, and we’ll find more cooks for you."
            />
          }
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
  // Lines up under the name in the row above (avatar 40 + gap).
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: SCREEN_GUTTER + 40 + spacing.md,
    paddingRight: SCREEN_GUTTER,
    marginTop: -spacing.sm,
    paddingBottom: spacing.sm,
  },
  reason: { flex: 1 },
  dismiss: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
