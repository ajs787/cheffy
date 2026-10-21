import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ListFooter } from '@/components/shared/ListFooter';
import { UserRow } from '@/components/shared/UserRow';
import { AppButton, AppHeader, ConfirmationDialog, EmptyState, ErrorState, RowSkeleton, SegmentedControl } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { useProfile } from '@/features/profile/hooks';
import { useConnections, useRemoveFollower } from '@/features/social/hooks';
import type { UserListItem } from '@/types/models';
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
  const me = useUserId();
  const removeFollower = useRemoveFollower();
  const [removing, setRemoving] = useState<UserListItem | null>(null);
  // Your own followers can be removed (they lose access if you're private).
  const canRemove = params.id === me && type === 'followers';

  return (
    <View style={styles.screen}>
      <AppHeader title={profile.data ? `@${profile.data.username}` : ''} />
      <SegmentedControl options={OPTIONS} value={type} onChange={setType} />
      <FlashList
        key={type}
        data={users}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => (
          <UserRow
            user={item}
            trailing={
              canRemove ? (
                <AppButton label="Remove" size="sm" variant="secondary" onPress={() => setRemoving(item)} />
              ) : undefined
            }
          />
        )}
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
      <ConfirmationDialog
        visible={removing !== null}
        title={removing ? `Remove @${removing.username}?` : ''}
        message="They won’t be told. If your account is private, they’ll need to request again to see your creations."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) removeFollower.mutate(removing.id);
          setRemoving(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingTop: spacing.sm },
});
