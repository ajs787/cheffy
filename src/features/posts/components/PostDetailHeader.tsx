import { router } from 'expo-router';
import { Bookmark, Lock, MessageCircle, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CategoryLine } from '@/components/shared/CategoryLine';
import { MadeTogetherTag } from '@/components/shared/MadeTogetherTag';
import { ImageCarousel } from '@/components/shared/ImageCarousel';
import { LikeButton } from '@/components/shared/LikeButton';
import { AppButton, AppText, Avatar, IconButton, RatingDisplay, TagChip } from '@/components/ui';
import { useToggleLike, useToggleSave } from '@/features/social/hooks';
import { openImageViewer, postImagesForViewer } from '@/stores/imageViewer';
import { colors, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { Post } from '@/types/models';
import { formatEntryDate, formatRelativeTime } from '@/utils/dates';
import { formatCount } from '@/utils/format';

import { CollaborationPanel } from '@/features/collaboration/components/CollaborationPanel';

import { PostDetails } from './PostDetails';
import { StoryBody } from './StoryBody';

export interface PostDetailHeaderProps {
  post: Post;
  /** Focus the comment field. */
  onCommentPress: () => void;
}

/** Everything above the comments on the post screen. */
export function PostDetailHeader({ post, onCommentPress }: PostDetailHeaderProps) {
  const { width } = useWindowDimensions();
  const toggleLike = useToggleLike();
  const toggleSave = useToggleSave();
  const VisibilityIcon = post.visibility === 'private' ? Lock : Users;
  const published = post.status === 'published';

  return (
    <View>
      {post.images.length > 0 ? (
        <ImageCarousel
          images={post.images}
          width={width}
          title={post.title}
          priority="high"
          onPress={(index) => openImageViewer(postImagesForViewer(post.images, post.title), index)}
          onDoubleTap={() => {
            if (published && !post.viewerHasLiked) toggleLike.mutate({ post, like: true });
          }}
        />
      ) : null}

      <View style={styles.body}>
        {post.status === 'removed' ? (
          <View style={styles.draftBanner} accessibilityRole="alert">
            <AppText variant="callout" style={styles.flex}>
              <AppText variant="calloutStrong">Removed by Cheffy’s moderators. </AppText>
              {post.removedReason ?? 'It broke the Community Guidelines.'} Only you can see it.
            </AppText>
          </View>
        ) : !published ? (
          <View style={styles.draftBanner}>
            <AppText variant="calloutStrong" style={styles.flex}>
              This is a draft — only you can see it.
            </AppText>
            <AppButton
              label="Finish"
              size="sm"
              onPress={() => router.push({ pathname: '/compose', params: { postId: post.id } })}
            />
          </View>
        ) : null}

        <View style={styles.meta}>
          <View style={styles.flex}>
            <CategoryLine post={post} />
          </View>
          <AppText variant="overline" color="textSecondary">
            {formatEntryDate(post.madeOn)}
          </AppText>
        </View>
        <View style={styles.titleRow}>
          <AppText variant="display" color="accent" accessibilityRole="header" style={styles.flex}>
            {post.title}
          </AppText>
          <RatingDisplay value={post.rating} size="lg" />
        </View>

        <Pressable
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.author.id } })}
          style={styles.author}
          accessibilityRole="link"
          accessibilityLabel={`By ${post.author.displayName}`}
        >
          <Avatar uri={post.author.avatarUrl} name={post.author.displayName} size="sm" />
          <View style={styles.flex}>
            <AppText variant="calloutStrong">{post.author.displayName}</AppText>
            <AppText variant="caption" color="textSecondary">
              @{post.author.username}
              {post.publishedAt ? ` · ${formatRelativeTime(post.publishedAt)}` : ''}
            </AppText>
            {post.coCreators.length > 0 ? <MadeTogetherTag /> : null}
          </View>
          {post.visibility !== 'public' ? (
            <View style={styles.visibility}>
              <VisibilityIcon size={12} color={colors.textSecondary} strokeWidth={strokes.bold} />
              <AppText variant="caption" color="textSecondary">
                {post.visibility === 'private' ? 'Only you' : 'Followers'}
              </AppText>
            </View>
          ) : null}
        </Pressable>

        {published ? (
          <View style={styles.actions}>
            <LikeButton
              liked={post.viewerHasLiked}
              count={post.likeCount}
              onToggle={() => toggleLike.mutate({ post, like: !post.viewerHasLiked })}
            />
            <Pressable
              onPress={onCommentPress}
              hitSlop={8}
              style={styles.action}
              accessibilityRole="button"
              accessibilityLabel={`Write a comment. ${post.commentCount} comments`}
            >
              <MessageCircle size={iconSizes.lg} color={colors.text} strokeWidth={strokes.regular} />
              {post.commentCount > 0 ? (
                <AppText variant="calloutStrong">{formatCount(post.commentCount)}</AppText>
              ) : null}
            </Pressable>
            <View style={styles.flex} />
            <IconButton
              icon={Bookmark}
              label={post.viewerHasSaved ? 'Remove from saved' : 'Save to make later'}
              filled={post.viewerHasSaved}
              onPress={() => toggleSave.mutate({ post, save: !post.viewerHasSaved })}
            />
          </View>
        ) : null}

        {post.review ? (
          <AppText variant="body" style={styles.review}>
            {post.review}
          </AppText>
        ) : null}

        {post.story ? <StoryBody story={post.story} /> : null}

        {post.tags.length > 0 ? (
          <View style={styles.tags}>
            {post.tags.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                onPress={() =>
                  router.push({ pathname: '/browse', params: { tagId: tag.id, title: `#${tag.name}` } })
                }
              />
            ))}
          </View>
        ) : null}

        <CollaborationPanel post={post} />

        <PostDetails post={post} />

        {published ? (
          <AppText variant="title2" style={styles.commentsTitle} accessibilityRole="header">
            Comments
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.lg, gap: spacing.lg },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: -spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  visibility: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // The 44pt touch targets already give the row its height; no extra gap needed.
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: -spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  review: { fontSize: 16, lineHeight: 24 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  commentsTitle: { marginTop: spacing.md },
});
