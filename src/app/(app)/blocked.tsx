import { FlashList } from '@shopify/flash-list';
import { ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppHeader, AppText, Avatar, EmptyState, ErrorState, RowSkeleton } from '@/components/ui';
import { useBlockedUsers, useUnblockUser } from '@/features/social/hooks';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

export default function BlockedScreen() {
  const blocked = useBlockedUsers();
  const unblock = useUnblockUser();

  return (
    <View style={styles.screen}>
      <AppHeader title="Blocked accounts" />
      {blocked.isPending ? (
        <RowSkeleton count={3} />
      ) : blocked.isError ? (
        <ErrorState error={blocked.error} onRetry={() => void blocked.refetch()} />
      ) : (
        <FlashList
          data={blocked.data}
          keyExtractor={(user) => user.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar uri={item.avatarUrl} name={item.displayName} size="md" />
              <View style={styles.text}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.displayName}
                </AppText>
                <AppText variant="callout" color="textSecondary">
                  @{item.username}
                </AppText>
              </View>
              <AppButton
                label="Unblock"
                size="sm"
                variant="secondary"
                loading={unblock.isPending && unblock.variables === item.id}
                onPress={() => unblock.mutate(item.id)}
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={ShieldCheck}
              title="No blocked accounts"
              message="People you block will appear here."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1 },
});
