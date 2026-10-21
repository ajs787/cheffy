import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { FollowButton } from '@/components/shared/FollowButton';
import { AppText, Avatar, FoodImage, PressableScale } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';
import { formatRelativeTime } from '@/utils/dates';

import type { ActivityItem } from '../api';

function sentence(item: ActivityItem): string {
  switch (item.kind) {
    case 'like':
      return ` liked your ${item.post.title}`;
    case 'comment':
      return ` commented on ${item.post.title}`;
    default:
      return ' started following you';
  }
}

function ActivityRowBase({ item }: { item: ActivityItem }) {
  const open = () =>
    item.kind === 'follow'
      ? router.push({ pathname: '/user/[id]', params: { id: item.actor.id } })
      : router.push({ pathname: '/post/[id]', params: { id: item.post.id } });

  return (
    <PressableScale
      onPress={open}
      activeScale={0.98}
      accessibilityRole="link"
      accessibilityLabel={`${item.actor.username}${sentence(item)}, ${formatRelativeTime(item.at)}`}
      style={styles.row}
    >
      <Avatar uri={item.actor.avatarUrl} name={item.actor.displayName} size="md" />
      <View style={styles.text}>
        <AppText variant="callout" numberOfLines={2}>
          <AppText variant="calloutStrong">{item.actor.username}</AppText>
          {sentence(item)}
          <AppText variant="callout" color="textTertiary">
            {'  '}
            {formatRelativeTime(item.at)}
          </AppText>
        </AppText>
        {item.kind === 'comment' ? (
          <AppText variant="callout" color="textSecondary" numberOfLines={2}>
            “{item.body}”
          </AppText>
        ) : null}
      </View>
      {item.kind === 'follow' ? (
        item.viewerIsFollowing ? null : (
          <FollowButton
            userId={item.actor.id}
            state={item.viewerHasRequested ? 'requested' : 'none'}
            isPrivate={item.actorIsPrivate}
          />
        )
      ) : (
        <FoodImage uri={item.post.thumbUrl} cacheKey={item.post.thumbPath ?? undefined} style={styles.thumb} radius="sm" />
      )}
    </PressableScale>
  );
}

export const ActivityRow = memo(ActivityRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm + 2,
  },
  text: { flex: 1, gap: 2 },
  thumb: { width: 48, height: 48 },
});
