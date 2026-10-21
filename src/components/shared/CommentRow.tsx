import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { Comment } from '@/types/models';
import { formatRelativeTime } from '@/utils/dates';

function CommentRowBase({
  comment,
  onLongPress,
}: {
  comment: Comment;
  onLongPress?: (comment: Comment) => void;
}) {
  const pending = comment.id.startsWith('pending-');
  return (
    <Pressable
      onLongPress={() => onLongPress?.(comment)}
      delayLongPress={350}
      disabled={pending}
      style={[styles.row, pending && styles.pending]}
      accessibilityHint={onLongPress ? 'Long press for options' : undefined}
      accessibilityLabel={`${comment.author.displayName}: ${comment.body}`}
    >
      <Pressable
        onPress={() => router.push({ pathname: '/user/[id]', params: { id: comment.author.id } })}
        accessibilityRole="link"
        accessibilityLabel={`${comment.author.displayName}'s profile`}
      >
        <Avatar uri={comment.author.avatarUrl} name={comment.author.displayName} size="sm" />
      </Pressable>
      <View style={styles.body}>
        <View style={styles.meta}>
          <AppText variant="calloutStrong">{comment.author.username}</AppText>
          <AppText variant="caption" color="textTertiary">
            {pending ? 'Posting…' : formatRelativeTime(comment.createdAt)}
          </AppText>
        </View>
        <AppText variant="body">{comment.body}</AppText>
      </View>
    </Pressable>
  );
}

export const CommentRow = memo(CommentRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm + 2,
  },
  pending: { opacity: 0.6 },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
});
