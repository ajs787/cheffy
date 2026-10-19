import { router, useLocalSearchParams } from 'expo-router';
import { Bookmark, Ellipsis, EyeOff, Lock, MessageCircle, Users } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryLine } from '@/components/shared/CategoryLine';
import { CommentRow } from '@/components/shared/CommentRow';
import { ImageCarousel } from '@/components/shared/ImageCarousel';
import { LikeButton } from '@/components/shared/LikeButton';
import {
  ActionSheet,
  AppButton,
  AppHeader,
  AppText,
  Avatar,
  EmptyState,
  ErrorState,
  IconButton,
  PostCardSkeleton,
  RatingDisplay,
  TagChip,
} from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { PostDetails } from '@/features/posts/components/PostDetails';
import { usePostMenu } from '@/features/posts/components/usePostMenu';
import { usePost } from '@/features/posts/hooks';
import { useMyProfile } from '@/features/profile/hooks';
import { ReportSheet } from '@/features/social/components/ReportSheet';
import { useAddComment, useComments, useDeleteComment, useToggleLike, useToggleSave } from '@/features/social/hooks';
import { colors, fonts, HAIRLINE, iconSizes, MAX_FONT_SCALE, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { Comment, ReportTarget } from '@/types/models';
import { formatRelativeTime } from '@/utils/dates';
import { formatCount } from '@/utils/format';

export default function PostScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const me = useUserId();
  const post = usePost(id);
  const comments = useComments(id);
  const toggleLike = useToggleLike();
  const toggleSave = useToggleSave();
  const menu = usePostMenu({ onDeleted: () => router.back() });
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const [commentMenu, setCommentMenu] = useState<Comment | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const deleteComment = useDeleteComment(id);

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
  const own = p.author.id === me;
  const allComments = comments.data?.pages.flat() ?? [];
  const VisibilityIcon = p.visibility === 'private' ? Lock : Users;

  const header = (
    <View>
      {p.images.length > 0 ? (
        <ImageCarousel
          images={p.images}
          width={width}
          title={p.title}
          priority="high"
          onDoubleTap={() => {
            if (!p.viewerHasLiked) toggleLike.mutate({ post: p, like: true });
          }}
        />
      ) : null}

      <View style={styles.body}>
        {p.status === 'draft' ? (
          <View style={styles.draftBanner}>
            <AppText variant="calloutStrong" style={styles.flex}>
              This is a draft — only you can see it.
            </AppText>
            <AppButton
              label="Finish"
              size="sm"
              onPress={() => router.push({ pathname: '/compose', params: { postId: p.id } })}
            />
          </View>
        ) : null}

        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <AppText variant="title1" accessibilityRole="header">
              {p.title}
            </AppText>
            <CategoryLine post={p} />
          </View>
          <RatingDisplay value={p.rating} size="lg" />
        </View>

        <Pressable
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.author.id } })}
          style={styles.author}
          accessibilityRole="link"
          accessibilityLabel={`By ${p.author.displayName}`}
        >
          <Avatar uri={p.author.avatarUrl} name={p.author.displayName} size="sm" />
          <View style={styles.flex}>
            <AppText variant="calloutStrong">{p.author.displayName}</AppText>
            <AppText variant="caption" color="textSecondary">
              @{p.author.username}
              {p.publishedAt ? ` · ${formatRelativeTime(p.publishedAt)}` : ''}
            </AppText>
          </View>
          {p.visibility !== 'public' ? (
            <View style={styles.visibility}>
              <VisibilityIcon size={12} color={colors.textSecondary} strokeWidth={strokes.bold} />
              <AppText variant="caption" color="textSecondary">
                {p.visibility === 'private' ? 'Only you' : 'Followers'}
              </AppText>
            </View>
          ) : null}
        </Pressable>

        {p.status === 'published' ? (
          <View style={styles.actions}>
            <LikeButton liked={p.viewerHasLiked} count={p.likeCount} onToggle={() => toggleLike.mutate({ post: p, like: !p.viewerHasLiked })} />
            <Pressable
              onPress={() => inputRef.current?.focus()}
              hitSlop={8}
              style={styles.action}
              accessibilityRole="button"
              accessibilityLabel="Write a comment"
            >
              <MessageCircle size={iconSizes.lg} color={colors.text} strokeWidth={strokes.regular} />
              {p.commentCount > 0 ? <AppText variant="calloutStrong">{formatCount(p.commentCount)}</AppText> : null}
            </Pressable>
            <View style={styles.flex} />
            <IconButton
              icon={Bookmark}
              label={p.viewerHasSaved ? 'Remove from saved' : 'Save to make later'}
              filled={p.viewerHasSaved}
              onPress={() => toggleSave.mutate({ post: p, save: !p.viewerHasSaved })}
            />
          </View>
        ) : null}

        {p.review ? (
          <AppText variant="body" style={styles.review}>
            {p.review}
          </AppText>
        ) : null}

        {p.tags.length > 0 ? (
          <View style={styles.tags}>
            {p.tags.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                onPress={() => router.push({ pathname: '/browse', params: { tagId: tag.id, title: `#${tag.name}` } })}
              />
            ))}
          </View>
        ) : null}

        <PostDetails post={p} />

        {p.status === 'published' ? (
          <AppText variant="title2" style={styles.commentsTitle} accessibilityRole="header">
            Comments
          </AppText>
        ) : null}
      </View>
    </View>
  );

  const commentActions =
    commentMenu === null
      ? []
      : commentMenu.author.id === me || own
        ? [
            {
              key: 'delete',
              label: 'Delete comment',
              destructive: true,
              onPress: () => deleteComment.mutate(commentMenu.id),
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
      <AppHeader
        right={<IconButton icon={Ellipsis} label="More options" onPress={() => menu.open(p)} />}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={p.status === 'published' ? allComments : []}
          keyExtractor={(comment) => comment.id}
          renderItem={({ item }) => <CommentRow comment={item} onLongPress={setCommentMenu} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            p.status === 'published' && !comments.isPending ? (
              <AppText variant="callout" color="textSecondary" style={styles.noComments}>
                No comments yet. Say something nice.
              </AppText>
            ) : undefined
          }
          ListFooterComponent={
            comments.isFetchingNextPage || comments.isPending ? (
              <ActivityIndicator color={colors.textTertiary} style={styles.loading} />
            ) : undefined
          }
          onEndReached={() => {
            if (comments.hasNextPage && !comments.isFetchingNextPage) void comments.fetchNextPage();
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.listContent}
        />
        {p.status === 'published' ? (
          <CommentComposer postId={p.id} inputRef={inputRef} autoFocus={focus === 'comment'} bottomInset={insets.bottom} />
        ) : null}
      </KeyboardAvoidingView>

      <ActionSheet visible={!!commentMenu} onClose={() => setCommentMenu(null)} actions={commentActions} />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
      {menu.element}
    </View>
  );
}

function CommentComposer({
  postId,
  inputRef,
  autoFocus,
  bottomInset,
}: {
  postId: string;
  inputRef: React.RefObject<ComponentRef<typeof TextInput> | null>;
  autoFocus: boolean;
  bottomInset: number;
}) {
  const [body, setBody] = useState('');
  const { data: me } = useMyProfile();
  const addComment = useAddComment(postId);
  const canSend = body.trim().length > 0 && body.trim().length <= 1000;

  const send = () => {
    if (!canSend) return;
    addComment.mutate(body);
    setBody('');
  };

  return (
    <View style={[styles.composer, { paddingBottom: Math.max(bottomInset, spacing.sm) }]}>
      <Avatar uri={me?.avatarUrl} name={me?.displayName ?? ''} size="sm" />
      <TextInput
        ref={inputRef}
        value={body}
        onChangeText={setBody}
        placeholder="Add a comment…"
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={1000}
        autoFocus={autoFocus}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        accessibilityLabel="Write a comment"
        style={styles.composerInput}
        testID="comment-input"
      />
      <Pressable
        onPress={send}
        disabled={!canSend}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Post comment"
        accessibilityState={{ disabled: !canSend }}
        testID="comment-send"
      >
        <AppText variant="calloutStrong" color={canSend ? 'accentStrong' : 'textTertiary'}>
          Post
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  listContent: { paddingBottom: spacing.xl },
  body: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.lg, gap: spacing.lg },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  visibility: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: -spacing.xxs, marginVertical: -spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, minHeight: 44, paddingHorizontal: spacing.xs },
  review: { fontSize: 16, lineHeight: 24 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  commentsTitle: { marginTop: spacing.md },
  noComments: { paddingHorizontal: SCREEN_GUTTER, paddingVertical: spacing.md },
  loading: { marginVertical: spacing.lg },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm,
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  composerInput: {
    flex: 1,
    maxHeight: 110,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
});
