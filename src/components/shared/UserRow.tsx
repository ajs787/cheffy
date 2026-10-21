import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, PressableScale } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { UserListItem } from '@/types/models';

import { FollowButton } from './FollowButton';

function UserRowBase({ user, showFollow = true }: { user: UserListItem; showFollow?: boolean }) {
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
      {showFollow && user.id !== me ? (
        <FollowButton userId={user.id} following={user.viewerIsFollowing} />
      ) : null}
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
