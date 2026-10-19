import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ListFooter } from '@/components/shared/ListFooter';
import { UserRow } from '@/components/shared/UserRow';
import { AppHeader, EmptyState, ErrorState, RowSkeleton, SegmentedControl } from '@/components/ui';
import { useProfile } from '@/features/profile/hooks';
import { useConnections } from '@/features/social/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, spacing } from '@/theme';

type ConnectionType = 'followers' | 'following';

const OPTIONS = [
  { value: 'followers', label: 'Followers' },
  { value: 'following', label: 'Following' },
] as const;

export default function ConnectionsScreen() {
  const params = useLocalSearchParams<{ id: string; type?: ConnectionType }>();
  const [type, setType] = useState<ConnectionType>(params.type === 'following' ? 'following' : 'followers');
  const profile = useProfile(params.id);
  const connections = useConnections(params.id, type);
  const users = connections.data?.pages.flat() ?? [];
  const { refreshing, onRefresh } = usePullToRefresh(() => connections.refetch());

  return (
    <View style={styles.screen}>
      <AppHeader title={profile.data ? `@${profile.data.username}` : ''} />
      <SegmentedControl options={OPTIONS} value={type} onChange={setType} />
      <FlashList
        key={type}
        data={users}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => <UserRow user={item} />}
        ListEmptyComponent={
          connections.isPending ? (
            <RowSkeleton />
          ) : connections.isError ? (
            <ErrorState error={connections.error} onRetry={() => void connections.refetch()} />
          ) : (
            <EmptyState
              icon={Users}
              title={type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            />
          )
        }
        ListFooterComponent={<ListFooter loading={connections.isFetchingNextPage} />}
        onEndReached={() => {
          if (connections.hasNextPage && !connections.isFetchingNextPage) void connections.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingTop: spacing.sm },
});
