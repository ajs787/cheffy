import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { FollowButton } from '@/components/shared/FollowButton';
import { AppButton, AppText, Avatar, FoodImage, PressableScale } from '@/components/ui';
import { useRespondToCollaboration } from '@/features/collaboration/hooks';
import { useRespondToFollowRequest } from '@/features/social/hooks';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';
import { followStateOf } from '@/types/models';
import { formatRelativeTime } from '@/utils/dates';

import { activityTarget, describe, type ActivityItem } from '../api';

function ActivityRowBase({ item }: { item: ActivityItem }) {
  const respond = useRespondToFollowRequest();
  const collab = useRespondToCollaboration();
  const sentence = describe(item);
  const showComment = item.commentBody && item.type !== 'comment_like';

  let trailing: React.ReactNode = null;
  if (item.type === 'follow_request') {
    trailing = (
      <View style={styles.requestActions}>
        <AppButton
          label="Confirm"
          size="sm"
          onPress={() => respond.mutate({ userId: item.actor.id, accept: true })}
        />
        <AppButton
          label="Delete"
          size="sm"
          variant="secondary"
          onPress={() => respond.mutate({ userId: item.actor.id, accept: false })}
        />
      </View>
    );
  } else if (item.type === 'collab_invite' && item.post) {
    const postId = item.post.id;
    trailing = (
      <View style={styles.requestActions}>
        <AppButton label="Accept" size="sm" onPress={() => collab.mutate({ postId, accept: true })} />
        <AppButton
          label="Decline"
          size="sm"
          variant="secondary"
          onPress={() => collab.mutate({ postId, accept: false })}
        />
      </View>
    );
  } else if (item.type === 'follow') {
    // Always shown, so following back turns it into "Following" (or
    // "Requested") instead of making the button vanish.
    trailing = (
      <FollowButton
        userId={item.actor.id}
        state={followStateOf(item.actor)}
        isPrivate={item.actor.isPrivate}
      />
    );
  } else if (item.post) {
    trailing = (
      <FoodImage
        uri={item.post.thumbUrl}
        cacheKey={item.post.thumbPath ?? undefined}
        style={styles.thumb}
        radius="sm"
      />
    );
  }

  return (
    <PressableScale
      onPress={() => router.push(activityTarget(item))}
      activeScale={0.98}
      accessibilityRole="link"
      accessibilityLabel={`${item.read ? '' : 'New. '}${item.actor.username} ${sentence}, ${formatRelativeTime(item.at)}`}
      style={[styles.row, !item.read && styles.unread]}
    >
      {!item.read ? <View style={styles.dot} /> : null}
      <Avatar uri={item.actor.avatarUrl} name={item.actor.displayName} size="md" />
      <View style={styles.text}>
        <AppText variant="callout" numberOfLines={3}>
          <AppText variant="calloutStrong">{item.actor.username}</AppText> {sentence}
          <AppText variant="callout" color="textTertiary">
            {'  '}
            {formatRelativeTime(item.at)}
          </AppText>
        </AppText>
        {showComment ? (
          <AppText variant="callout" color="textSecondary" numberOfLines={2}>
            “{item.commentBody}”
          </AppText>
        ) : null}
      </View>
      {trailing}
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
  // Unread: a warm tint and an oxblood dot in the gutter.
  unread: { backgroundColor: colors.tint },
  dot: {
    position: 'absolute',
    left: spacing.xs + 2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  text: { flex: 1, gap: 2 },
  thumb: { width: 48, height: 48 },
  requestActions: { flexDirection: 'row', gap: spacing.xs },
});
