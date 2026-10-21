import { router } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { colors, fonts, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { Comment } from '@/types/models';
import { formatRelativeTime } from '@/utils/dates';
import { formatCount } from '@/utils/format';

export interface CommentRowProps {
  comment: Comment;
  /** Replies sit indented under their comment with a smaller avatar. */
  nested?: boolean;
  onLongPress?: (comment: Comment) => void;
  onReply?: (comment: Comment) => void;
  onToggleLike?: (comment: Comment) => void;
}

const openProfile = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });

function CommentRowBase({ comment, nested = false, onLongPress, onReply, onToggleLike }: CommentRowProps) {
  const pending = comment.id.startsWith('pending-');
  const liked = comment.viewerHasLiked;
  return (
    <Pressable
      onLongPress={() => onLongPress?.(comment)}
      delayLongPress={350}
      disabled={pending}
      style={[styles.row, nested && styles.nested, pending && styles.pending]}
      accessibilityHint={onLongPress ? 'Long press for options' : undefined}
      accessibilityLabel={`${comment.author.displayName}${comment.replyTo ? `, replying to @${comment.replyTo.username}` : ''}: ${comment.body}`}
    >
      <Pressable
        onPress={() => openProfile(comment.author.id)}
        accessibilityRole="link"
        accessibilityLabel={`${comment.author.displayName}'s profile`}
      >
        <Avatar
          uri={comment.author.avatarUrl}
          name={comment.author.displayName}
          size={nested ? 'xs' : 'sm'}
        />
      </Pressable>

      <View style={styles.body}>
        <View style={styles.meta}>
          <AppText variant="calloutStrong">{comment.author.username}</AppText>
          <AppText variant="caption" color="textTertiary">
            {pending ? 'Posting…' : formatRelativeTime(comment.createdAt)}
          </AppText>
        </View>
        <AppText variant="body">
          {comment.replyTo ? (
            <AppText variant="body" style={styles.mention} onPress={() => openProfile(comment.replyTo!.id)}>
              @{comment.replyTo.username}{' '}
            </AppText>
          ) : null}
          {comment.body}
        </AppText>
        {!pending && onReply ? (
          <Pressable
            onPress={() => onReply(comment)}
            hitSlop={8}
            style={styles.reply}
            accessibilityRole="button"
            accessibilityLabel={`Reply to ${comment.author.username}`}
          >
            <AppText variant="caption" color="textSecondary" style={styles.replyText}>
              Reply
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {!pending && onToggleLike ? (
        <Pressable
          onPress={() => onToggleLike(comment)}
          hitSlop={10}
          style={styles.like}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? 'Unlike comment' : 'Like comment'}
          accessibilityValue={{ text: `${comment.likeCount} ${comment.likeCount === 1 ? 'like' : 'likes'}` }}
        >
          <Heart
            size={15}
            color={liked ? colors.accent : colors.textTertiary}
            fill={liked ? colors.accent : 'transparent'}
            strokeWidth={strokes.bold}
          />
          {comment.likeCount > 0 ? (
            <AppText variant="caption" color={liked ? 'accent' : 'textTertiary'}>
              {formatCount(comment.likeCount)}
            </AppText>
          ) : null}
        </Pressable>
      ) : null}
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
  // Indent under the parent's avatar column; one level only.
  nested: { paddingLeft: SCREEN_GUTTER + 32 + spacing.md, paddingVertical: spacing.sm },
  pending: { opacity: 0.6 },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  mention: { fontFamily: fonts.textSemiBold, color: colors.accent },
  reply: { alignSelf: 'flex-start', marginTop: 2 },
  replyText: { fontFamily: fonts.textSemiBold },
  like: { alignItems: 'center', gap: 2, paddingTop: spacing.xs, minWidth: 24 },
});
