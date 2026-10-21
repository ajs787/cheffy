import { router } from 'expo-router';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, PressableScale } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { SCREEN_GUTTER, spacing } from '@/theme';
import { followStateOf, type UserListItem } from '@/types/models';

import { FollowButton } from './FollowButton';

function UserRowBase({
  user,
  showFollow = true,
  trailing,
}: {
  user: UserListItem;
  showFollow?: boolean;
  /** Replaces the Follow button (e.g. Remove, Confirm/Delete). */
  trailing?: ReactNode;
}) {
  const me = useUserId();
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/user/[id]', params: { id: user.id } })}
      activeScale={0.98}
      accessibilityRole="link"
      accessibilityLabel={`${user.displayName}, @${user.username}`}
      style={styles.row}
    >
      <Avatar uri={user.avatarUrl} name={user.displayName} size="md" />
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {user.displayName}
        </AppText>
        <AppText variant="callout" color="textSecondary" numberOfLines={1}>
          @{user.username}
        </AppText>
      </View>
      {trailing ??
        (showFollow && user.id !== me ? (
          <FollowButton userId={user.id} state={followStateOf(user)} isPrivate={user.isPrivate} />
        ) : null)}
    </PressableScale>
  );
}

export const UserRow = memo(UserRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1 },
});
