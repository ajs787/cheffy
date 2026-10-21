import { UserCheck } from 'lucide-react-native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { UserRow } from '@/components/shared/UserRow';
import { AppButton, AppHeader, EmptyState, ErrorState, RowSkeleton } from '@/components/ui';
import { useFollowRequests, useRespondToFollowRequest } from '@/features/social/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, spacing } from '@/theme';

/** People asking to follow a private account: Confirm or Delete each. */
export default function FollowRequestsScreen() {
  const requests = useFollowRequests();
  const respond = useRespondToFollowRequest();
  const { refreshing, onRefresh } = usePullToRefresh(() => requests.refetch());

  return (
    <View style={styles.screen}>
      <AppHeader title="Follow requests" />
      <FlatList
        data={requests.data ?? []}
        keyExtractor={(request) => request.user.id}
        renderItem={({ item }) => (
          <UserRow
            user={item.user}
            trailing={
              <View style={styles.actions}>
                <AppButton
                  label="Confirm"
                  size="sm"
                  onPress={() => respond.mutate({ userId: item.user.id, accept: true })}
                  accessibilityHint={`Lets @${item.user.username} follow you`}
                />
                <AppButton
                  label="Delete"
                  size="sm"
                  variant="secondary"
                  onPress={() => respond.mutate({ userId: item.user.id, accept: false })}
                  accessibilityHint={`Declines @${item.user.username}'s request`}
                />
              </View>
            }
          />
        )}
        ListEmptyComponent={
          requests.isPending ? (
            <RowSkeleton />
          ) : requests.isError ? (
            <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
          ) : (
            <EmptyState
              icon={UserCheck}
              title="No requests right now"
              message="When someone asks to follow your private account, they'll show up here."
            />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.xs },
});
