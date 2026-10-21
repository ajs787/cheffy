import { router, useLocalSearchParams } from 'expo-router';
import { Ellipsis, EyeOff } from 'lucide-react-native';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  ActionSheet,
  AppHeader,
  AppText,
  EmptyState,
  ErrorState,
  IconButton,
  PostCardSkeleton,
  type SheetAction,
} from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { PostDetailHeader } from '@/features/posts/components/PostDetailHeader';
import { usePostMenu } from '@/features/posts/components/usePostMenu';
import { usePost } from '@/features/posts/hooks';
import type { ReplyTarget } from '@/features/comments/api';
import { CommentComposer } from '@/features/comments/components/CommentComposer';
import { CommentThread } from '@/features/comments/components/CommentThread';
import { useComments, useDeleteComment, useToggleCommentLike } from '@/features/comments/hooks';
import { ReportSheet } from '@/features/social/components/ReportSheet';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';
import type { Comment, ReportTarget } from '@/types/models';

export default function PostScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const me = useUserId();
  const post = usePost(id);
  const comments = useComments(id);
  const deleteComment = useDeleteComment(id);
  const menu = usePostMenu({ onDeleted: () => router.back() });
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [commentMenu, setCommentMenu] = useState<Comment | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const toggleLike = useToggleCommentLike();
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // Threads the viewer has opened (or just replied in).
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = useCallback(
    (commentId: string) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(commentId)) next.delete(commentId);
        else next.add(commentId);
        return next;
      }),
    [],
  );
  const startReply = useCallback((comment: Comment) => {
    // Replies always join the top-level comment's thread.
    setReplyTo({ parentId: comment.parentId ?? comment.id, user: comment.author });
    inputRef.current?.focus();
  }, []);
  const onToggleLike = useCallback(
    (comment: Comment) => toggleLike.mutate({ comment, like: !comment.viewerHasLiked }),
    [toggleLike],
  );
  const { refreshing, onRefresh } = usePullToRefresh(() => Promise.all([post.refetch(), comments.refetch()]));

  if (post.isPending) {
    return (
      <View style={styles.screen}>
        <AppHeader />
        <PostCardSkeleton />
      </View>
    );
  }

  if (post.isError && !post.data) {
    return (
      <View style={styles.screen}>
        <AppHeader />
        <ErrorState error={post.error} onRetry={() => void post.refetch()} />
      </View>
    );
  }

  if (!post.data) {
    return (
      <View style={styles.screen}>
        <AppHeader />
        <EmptyState
          icon={EyeOff}
          title="This post isn’t available"
          message="It may have been deleted, or its visibility changed."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const p = post.data;
  const published = p.status === 'published';
  const canModerate = (comment: Comment) => comment.author.id === me || p.author.id === me;

  const commentActions: SheetAction[] = !commentMenu
    ? []
    : canModerate(commentMenu)
      ? [
          {
            key: 'delete',
            label: commentMenu.parentId ? 'Delete reply' : 'Delete comment',
            destructive: true,
            onPress: () => deleteComment.mutate(commentMenu),
          },
        ]
      : [
          {
            key: 'report',
            label: 'Report comment',
            destructive: true,
            onPress: () => setReportTarget({ type: 'comment', commentId: commentMenu.id }),
          },
        ];

  return (
    <View style={styles.screen}>
      <AppHeader right={<IconButton icon={Ellipsis} label="More options" onPress={() => menu.open(p)} />} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={published ? (comments.data?.pages.flat() ?? []) : []}
          keyExtractor={(comment) => comment.id}
          renderItem={({ item }) => (
            <CommentThread
              comment={item}
              expanded={expanded.has(item.id)}
              onToggleExpanded={toggleExpanded}
              onLongPress={setCommentMenu}
              onReply={startReply}
              onToggleLike={onToggleLike}
            />
          )}
          ListHeaderComponent={<PostDetailHeader post={p} onCommentPress={() => inputRef.current?.focus()} />}
          ListEmptyComponent={
            published && !comments.isPending ? (
              <AppText variant="callout" color="textSecondary" style={styles.noComments}>
                No comments yet. Say something nice.
              </AppText>
            ) : undefined
          }
          ListFooterComponent={
            comments.isFetchingNextPage || (published && comments.isPending) ? (
              <ActivityIndicator color={colors.textTertiary} style={styles.loading} />
            ) : undefined
          }
          onEndReached={() => {
            if (comments.hasNextPage && !comments.isFetchingNextPage) void comments.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.listContent}
        />
        {published ? (
          <CommentComposer
            postId={p.id}
            inputRef={inputRef}
            autoFocus={focus === 'comment'}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSent={(reply) => {
              setReplyTo(null);
              if (reply) setExpanded((current) => new Set(current).add(reply.parentId));
            }}
          />
        ) : null}
      </KeyboardAvoidingView>

      <ActionSheet visible={!!commentMenu} onClose={() => setCommentMenu(null)} actions={commentActions} />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
      {menu.element}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  listContent: { paddingBottom: spacing.xl },
  noComments: { paddingHorizontal: SCREEN_GUTTER, paddingVertical: spacing.md },
  loading: { marginVertical: spacing.lg },
});
