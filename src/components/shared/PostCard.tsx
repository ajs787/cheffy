import { router } from 'expo-router';
import { Bookmark, Ellipsis, MessageCircle } from 'lucide-react-native';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Avatar, IconButton, RatingDisplay, TagChip } from '@/components/ui';
import { useToggleLike, useToggleSave } from '@/features/social/hooks';
import { colors, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { Post } from '@/types/models';
import { formatRelativeTime } from '@/utils/dates';
import { formatCount } from '@/utils/format';

import { CategoryLine } from './CategoryLine';
import { ImageCarousel } from './ImageCarousel';
import { LikeButton } from './LikeButton';

export interface PostCardProps {
  post: Post;
  onOpenMenu: (post: Post) => void;
  /** Load the first image eagerly (top of the feed). */
  priority?: boolean;
}

function openProfile(userId: string) {
  router.push({ pathname: '/user/[id]', params: { id: userId } });
}

function PostCardBase({ post, onOpenMenu, priority = false }: PostCardProps) {
  const { width } = useWindowDimensions();
  const toggleLike = useToggleLike();
  const toggleSave = useToggleSave();
  const [expanded, setExpanded] = useState(false);

  const openPost = (focusComment = false) =>
    router.push({ pathname: '/post/[id]', params: focusComment ? { id: post.id, focus: 'comment' } : { id: post.id } });

  const like = () => toggleLike.mutate({ post, like: !post.viewerHasLiked });

  return (
    <View style={styles.card} testID={`post-card-${post.id}`}>
      <View style={styles.header}>
        <Pressable
          onPress={() => openProfile(post.author.id)}
          style={styles.author}
          accessibilityRole="link"
          accessibilityLabel={`${post.author.displayName}, @${post.author.username}`}
        >
          <Avatar uri={post.author.avatarUrl} name={post.author.displayName} size="sm" />
          <View style={styles.authorText}>
            <AppText variant="calloutStrong" numberOfLines={1}>
              {post.author.displayName}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              @{post.author.username}
              {post.publishedAt ? ` · ${formatRelativeTime(post.publishedAt)}` : ''}
            </AppText>
          </View>
        </Pressable>
        <IconButton icon={Ellipsis} label="More options" color={colors.textSecondary} size="md" onPress={() => onOpenMenu(post)} />
      </View>

      {post.images.length > 0 ? (
        <ImageCarousel
          images={post.images}
          width={width}
          title={post.title}
          onPress={() => openPost()}
          onDoubleTap={() => {
            if (!post.viewerHasLiked) like();
          }}
          priority={priority ? 'high' : 'normal'}
        />
      ) : null}

      <Pressable onPress={() => openPost()} style={styles.body} accessibilityRole="link" accessibilityLabel={`Open ${post.title}`}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <AppText variant="title2" numberOfLines={2}>
              {post.title}
            </AppText>
            <CategoryLine post={post} />
          </View>
          <RatingDisplay value={post.rating} size="md" />
        </View>
        {post.review ? (
          <AppText
            variant="body"
            numberOfLines={expanded ? undefined : 3}
            onPress={() => setExpanded((v) => !v)}
            style={styles.review}
          >
            {post.review}
          </AppText>
        ) : null}
      </Pressable>

      {post.tags.length > 0 ? (
        <View style={styles.tags}>
          {post.tags.slice(0, 5).map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              onPress={() => router.push({ pathname: '/browse', params: { tagId: tag.id, title: `#${tag.name}` } })}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <LikeButton liked={post.viewerHasLiked} count={post.likeCount} onToggle={like} />
        <Pressable
          onPress={() => openPost(true)}
          hitSlop={8}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={`Comments, ${post.commentCount}`}
        >
          <MessageCircle size={iconSizes.lg} color={colors.text} strokeWidth={strokes.regular} />
          {post.commentCount > 0 ? <AppText variant="calloutStrong">{formatCount(post.commentCount)}</AppText> : null}
        </Pressable>
        <View style={styles.spacer} />
        <IconButton
          icon={Bookmark}
          label={post.viewerHasSaved ? 'Remove from saved' : 'Save to make later'}
          filled={post.viewerHasSaved}
          color={colors.text}
          onPress={() => toggleSave.mutate({ post, save: !post.viewerHasSaved })}
        />
      </View>
    </View>
  );
}

export const PostCard = memo(PostCardBase);

const styles = StyleSheet.create({
  card: { paddingBottom: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SCREEN_GUTTER,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
  },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  authorText: { flex: 1 },
  body: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.md, gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titleText: { flex: 1, gap: spacing.xs },
  review: { color: colors.text },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm + 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: SCREEN_GUTTER - spacing.xxs,
    paddingRight: spacing.xs,
    paddingTop: spacing.xs,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, minHeight: 44, paddingHorizontal: spacing.xs },
  spacer: { flex: 1 },
});
