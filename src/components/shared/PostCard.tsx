import { router } from 'expo-router';
import { Bookmark, Ellipsis, MessageCircle } from 'lucide-react-native';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Avatar, IconButton, RatingDisplay, TagChip } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { StoryTeaser } from '@/features/posts/components/StoryTeaser';
import { likedBySummary } from '@/features/social/likedBy';
import { useToggleLike, useToggleSave } from '@/features/social/hooks';
import { colors, fonts, HAIRLINE, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { Post } from '@/types/models';
import { formatEntryDate, formatRelativeTime } from '@/utils/dates';
import { formatCount } from '@/utils/format';

import { CategoryLine } from './CategoryLine';
import { LikeButton } from './LikeButton';
import { PhotoMosaic } from './PhotoMosaic';

export interface PostCardProps {
  post: Post;
  onOpenMenu: (post: Post) => void;
}

function openProfile(userId: string) {
  router.push({ pathname: '/user/[id]', params: { id: userId } });
}

/**
 * A diary entry in the feed. Information first — who made what and how they
 * rated it — then balanced, inset photos, the review and social context.
 */
function PostCardBase({ post, onOpenMenu }: PostCardProps) {
  const { width } = useWindowDimensions();
  const me = useUserId();
  const toggleLike = useToggleLike();
  const toggleSave = useToggleSave();
  const [expanded, setExpanded] = useState(false);

  const openPost = (focusComment = false) =>
    router.push({ pathname: '/post/[id]', params: focusComment ? { id: post.id, focus: 'comment' } : { id: post.id } });
  const likedBy = likedBySummary(post.recentLikers, post.likeCount, post.viewerHasLiked, me);

  return (
    <View style={styles.card} testID={`post-card-${post.id}`}>
      <View style={styles.creator}>
        <Pressable
          onPress={() => openProfile(post.author.id)}
          style={styles.author}
          accessibilityRole="link"
          accessibilityLabel={`${post.author.displayName}, @${post.author.username}`}
        >
          <Avatar uri={post.author.avatarUrl} name={post.author.displayName} size="sm" />
          <View style={styles.flex}>
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

      <Pressable onPress={() => openPost()} style={styles.entry} accessibilityRole="link" accessibilityLabel={`Open ${post.title}`}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <AppText variant="title1" color="accent" numberOfLines={3}>
              {post.title}
            </AppText>
            <View style={styles.meta}>
              <View style={styles.flex}>
                <CategoryLine post={post} />
              </View>
              <AppText variant="overline" color="textSecondary">
                {formatEntryDate(post.madeOn)}
              </AppText>
            </View>
          </View>
          <RatingDisplay value={post.rating} size="lg" />
        </View>
      </Pressable>

      {post.images.length > 0 ? (
        <View style={styles.photos}>
          <PhotoMosaic images={post.images} width={width - SCREEN_GUTTER * 2} title={post.title} onPress={() => openPost()} />
        </View>
      ) : null}

      {post.review || post.story || post.tags.length > 0 ? (
        <View style={styles.words}>
          {post.review ? (
            <AppText variant="body" numberOfLines={expanded ? undefined : 3} onPress={() => setExpanded((v) => !v)}>
              {post.review}
            </AppText>
          ) : null}
          {post.story ? (
            <Pressable onPress={() => openPost()} accessibilityRole="link">
              <StoryTeaser story={post.story} />
            </Pressable>
          ) : null}
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
        </View>
      ) : null}

      {likedBy ? (
        <AppText variant="caption" color="textSecondary" style={styles.likedBy}>
          {likedBy.lead ? (
            <>
              Liked by <AppText variant="caption" style={styles.likedByName}>{likedBy.lead}</AppText>
              {likedBy.others > 0 ? ` and ${formatCount(likedBy.others)} ${likedBy.others === 1 ? 'other' : 'others'}` : ''}
            </>
          ) : (
            `${formatCount(likedBy.others)} ${likedBy.others === 1 ? 'like' : 'likes'}`
          )}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <LikeButton liked={post.viewerHasLiked} count={post.likeCount} onToggle={() => toggleLike.mutate({ post, like: !post.viewerHasLiked })} />
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
        <View style={styles.flex} />
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
  card: { paddingTop: spacing.md, paddingBottom: spacing.xs, gap: spacing.md },
  flex: { flex: 1 },
  creator: { flexDirection: 'row', alignItems: 'center', paddingLeft: SCREEN_GUTTER, paddingRight: spacing.xs },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  entry: { paddingHorizontal: SCREEN_GUTTER },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titleText: { flex: 1, gap: spacing.xs + 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photos: { paddingHorizontal: SCREEN_GUTTER },
  words: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm + 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  likedBy: { paddingHorizontal: SCREEN_GUTTER, marginBottom: -spacing.xs },
  likedByName: { fontFamily: fonts.textSemiBold, color: colors.text },
  // The entry's espresso rule, then its actions.
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.xxs,
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.rule,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, minHeight: 44, paddingHorizontal: spacing.xs },
});
