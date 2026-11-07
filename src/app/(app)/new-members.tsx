import { FlashList } from '@shopify/flash-list';
import { Users } from 'lucide-react-native';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ListFooter } from '@/components/shared/ListFooter';
import { UserRow } from '@/components/shared/UserRow';
import { AppHeader, EmptyState, ErrorState, RowSkeleton } from '@/components/ui';
import { useAllNewMembers } from '@/features/social/hooks';
import { isRecentlyJoined, joinedLabel } from '@/features/social/newMembers';
import { useRecentPeople } from '@/features/social/recentPeople';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors } from '@/theme';

/** Every eligible member, newest first, paged: so anyone who joins can be found. */
export default function NewMembersScreen() {
  const list = useAllNewMembers();
  const recents = useRecentPeople();
  const { refreshing, onRefresh } = usePullToRefresh(() => list.refetch());
  // A member can shift onto the next page when someone new joins; list them once.
  const people = [...new Map((list.data?.pages.flat() ?? []).map((p) => [p.id, p])).values()];
  const now = new Date();

  return (
    <View style={styles.screen}>
      <AppHeader title="New to Cheffy" />
      {list.isPending ? (
        <RowSkeleton count={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          data={people}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <UserRow
              user={item}
              detail={`${isRecentlyJoined(item.joinedAt, now) ? 'New · ' : ''}${joinedLabel(item.joinedAt, now)}`}
              onOpen={recents.add}
            />
          )}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              compact
              title="You’ve met everyone"
              message="When new cooks join Cheffy, they’ll show up here."
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
});
