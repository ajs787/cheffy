import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fonts, HAIRLINE, SCREEN_GUTTER, spacing } from '@/theme';
import type { Comment } from '@/types/models';

import { useReplies } from '../hooks';
import { CommentRow, type CommentRowProps } from './CommentRow';

export interface CommentThreadProps extends Omit<CommentRowProps, 'comment' | 'nested'> {
  comment: Comment;
  expanded: boolean;
  onToggleExpanded: (commentId: string) => void;
}

/**
 * A top-level comment and its replies (one level). Replies load when the
 * thread is opened, a page at a time.
 */
function CommentThreadBase({ comment, expanded, onToggleExpanded, ...rowProps }: CommentThreadProps) {
  const replies = useReplies(comment.id, expanded && comment.replyCount > 0);
  const loaded = replies.data?.pages.flat() ?? [];
  const pending = comment.id.startsWith('pending-');
  const hidden = Math.max(0, comment.replyCount - loaded.length);

  return (
    <View>
      <CommentRow comment={comment} {...rowProps} />
      {expanded
        ? loaded.map((reply) => <CommentRow key={reply.id} comment={reply} nested {...rowProps} />)
        : null}
      {!pending && comment.replyCount > 0 ? (
        <Pressable
          onPress={() => {
            if (expanded && replies.hasNextPage) void replies.fetchNextPage();
            else onToggleExpanded(comment.id);
          }}
          style={styles.toggle}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <View style={styles.rule} />
          {replies.isFetching ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : (
            <AppText variant="caption" color="textSecondary" style={styles.toggleText}>
              {!expanded
                ? `View ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`
                : replies.hasNextPage
                  ? `View ${hidden} more ${hidden === 1 ? 'reply' : 'replies'}`
                  : 'Hide replies'}
            </AppText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export const CommentThread = memo(CommentThreadBase);

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: SCREEN_GUTTER + 32 + spacing.md,
    paddingBottom: spacing.sm,
    minHeight: 28,
  },
  rule: { width: 24, height: HAIRLINE, backgroundColor: colors.textTertiary },
  toggleText: { fontFamily: fonts.textSemiBold },
});
