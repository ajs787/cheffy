import { router } from 'expo-router';
import { Bookmark, Ellipsis, MessageCircle } from 'lucide-react-native';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Avatar, IconButton, RatingDisplay, TagChip } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { StorySection } from '@/features/posts/components/StorySection';
import { likedBySummary } from '@/features/social/likedBy';
import { openImageViewer, postImagesForViewer } from '@/stores/imageViewer';
import { useAnonymousLikeMenu } from '@/features/social/components/AnonymousLikeSheet';
import { useToggleLike, useToggleSave } from '@/features/social/hooks';
import { colors, fonts, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import { madeByNames, type Post } from '@/types/models';
import { formatEntryDate, formatRelativeTime } from '@/utils/dates';
import { formatCount } from '@/utils/format';

import { BudgetTag } from './BudgetTag';
import { CategoryLine } from './CategoryLine';
import { MadeTogetherTag } from './MadeTogetherTag';
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
  const anonymousLike = useAnonymousLikeMenu(() => toggleLike.mutate({ post, like: true, anonymous: true }));
  const [expanded, setExpanded] = useState(false);

  const openPost = (focusComment = false) =>
    router.push({
      pathname: '/post/[id]',
      params: focusComment ? { id: post.id, focus: 'comment' } : { id: post.id },
    });
  const openLikes = () => router.push({ pathname: '/likes/[id]', params: { id: post.id } });
  const likedBy = likedBySummary(post.recentLikers, post.likeCount, post.viewerHasLiked, me);

  return (
    <View style={styles.card} testID={`post-card-${post.id}`}>
      <View style={styles.body}>
        <View style={styles.creator}>
          <Pressable
            onPress={() => openProfile(post.author.id)}
            style={styles.author}
            accessibilityRole="link"
            accessibilityLabel={`${madeByNames([post.author.displayName, ...post.coCreators.map((c) => c.profile.displayName)])}, @${post.author.username}`}
          >
            <Avatar uri={post.author.avatarUrl} name={post.author.displayName} size="sm" />
            <View style={styles.flex}>
              <AppText variant="calloutStrong" numberOfLines={1}>
                {madeByNames([post.author.displayName, ...post.coCreators.map((c) => c.profile.displayName)])}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                @{post.author.username}
                {post.publishedAt ? ` · ${formatRelativeTime(post.publishedAt)}` : ''}
              </AppText>
              {post.coCreators.length > 0 ? <MadeTogetherTag /> : null}
            </View>
          </Pressable>
          <IconButton
            icon={Ellipsis}
            label="More options"
            color={colors.textSecondary}
            size="md"
            onPress={() => onOpenMenu(post)}
          />
        </View>

        <Pressable
          onPress={() => openPost()}
          style={styles.entry}
          accessibilityRole="link"
          accessibilityLabel={`Open ${post.title}`}
        >
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
              {post.isBudget ? <BudgetTag costCents={post.budgetCostCents} /> : null}
            </View>
            <RatingDisplay value={post.rating} size="lg" />
          </View>
        </Pressable>

        {post.images.length > 0 ? (
          <View style={styles.photos}>
            <PhotoMosaic
              images={post.images}
              width={width - SCREEN_GUTTER * 2}
              title={post.title}
              onPress={(index) => openImageViewer(postImagesForViewer(post.images, post.title), index)}
            />
          </View>
        ) : null}

        {post.review || post.story || post.tags.length > 0 ? (
          <View style={styles.words}>
            {post.review ? (
              <AppText
                variant="body"
                numberOfLines={expanded ? undefined : 3}
                onPress={() => setExpanded((v) => !v)}
              >
                {post.review}
              </AppText>
            ) : null}
            {/* Keyed by post so a recycled feed cell never keeps another post's state. */}
            {post.story ? <StorySection key={post.id} story={post.story} /> : null}
            {post.tags.length > 0 ? (
              <View style={styles.tags}>
                {post.tags.slice(0, 5).map((tag) => (
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
          </View>
        ) : null}
      </View>

      {/* Actions, likes and comment previews read as one block, tucked closer to
          the entry than the entry's own sections are to each other. */}
      <View style={styles.footer}>
        <View style={styles.actions}>
          <LikeButton
            liked={post.viewerHasLiked}
            count={post.likeCount}
            onToggle={() => toggleLike.mutate({ post, like: !post.viewerHasLiked })}
            onLongPress={anonymousLike.onLongPress}
            anonymous={post.viewerLikedAnonymously}
            onPressCount={openLikes}
            // A fixed slot for the count, so the comment button sits in the
            // same place with no likes, 8 likes or 80.
            countWidth={LIKE_COUNT_SLOT}
            style={styles.compactAction}
          />
          {anonymousLike.sheet}
          <Pressable
            onPress={() => openPost(true)}
            hitSlop={8}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={`Comments, ${post.commentCount}`}
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
            color={colors.text}
            onPress={() => toggleSave.mutate({ post, save: !post.viewerHasSaved })}
            style={styles.compactAction}
          />
        </View>

        {likedBy || post.commentCount > 0 ? (
          // Instagram order: actions, then likes, then a link to the comments.
          <View style={styles.social}>
            {likedBy ? (
              // The whole line is the target, not just the name.
              <Pressable
                onPress={openLikes}
                hitSlop={{ top: 6, bottom: 4 }}
                style={styles.likedBy}
                accessibilityRole="button"
                accessibilityHint="Shows who liked this"
                testID={`post-card-liked-by-${post.id}`}
              >
                <AppText variant="caption" color="textSecondary">
                  {likedBy.lead ? (
                    <>
                      Liked by{' '}
                      <AppText variant="caption" style={styles.likedByName}>
                        {likedBy.lead}
                      </AppText>
                      {likedBy.others > 0
                        ? ` and ${formatCount(likedBy.others)} ${likedBy.others === 1 ? 'other' : 'others'}`
                        : ''}
                    </>
                  ) : (
                    `${formatCount(likedBy.others)} ${likedBy.others === 1 ? 'like' : 'likes'}`
                  )}
                </AppText>
              </Pressable>
            ) : null}
            {post.commentCount > 0 ? (
              <Pressable
                onPress={() => openPost(true)}
                hitSlop={{ top: 4, bottom: 6 }}
                style={styles.viewComments}
                accessibilityRole="link"
                accessibilityHint="Opens the comments"
                testID={`post-card-comments-${post.id}`}
              >
                <AppText variant="caption" color="textSecondary">
                  {post.commentCount === 1
                    ? 'View 1 comment'
                    : `View all ${formatCount(post.commentCount)} comments`}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const PostCard = memo(PostCardBase);

/**
 * The like/comment/save row is 32 pt tall: 4 pt above and below the 24 pt
 * icons. Each button's hitSlop (6–8 pt a side) keeps its touch area at least
 * 44 pt.
 */
const ACTION_ROW = 32;
/** Fits "99" at full size; "999" or "1.2k" shrink slightly to stay inside. */
const LIKE_COUNT_SLOT = 20;

const styles = StyleSheet.create({
  card: { paddingTop: spacing.md, paddingBottom: spacing.xs },
  body: { gap: spacing.md },
  // ~12 pt from the last line of the entry to the icons (8 + the row's 4).
  footer: { marginTop: spacing.sm },
  flex: { flex: 1 },
  creator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SCREEN_GUTTER,
    paddingRight: spacing.xs,
  },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  entry: { paddingHorizontal: SCREEN_GUTTER },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titleText: { flex: 1, gap: spacing.xs + 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photos: { paddingHorizontal: SCREEN_GUTTER },
  words: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm + 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  // "Liked by" and "View comments" sit ~8 pt under the icons (the row's 4 + 4)
  // as a pair of small lines.
  social: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.xs,
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  likedBy: { alignSelf: 'stretch' },
  likedByName: { fontFamily: fonts.textSemiBold, color: colors.text },
  viewComments: { alignSelf: 'flex-start' },
  // No rule above the actions: they belong to the entry. The feed's soft
  // divider between posts marks where an entry ends.
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: SCREEN_GUTTER,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: ACTION_ROW,
    // Flush left: the row's 8 pt gap is the whole space after the like count.
    paddingRight: spacing.xs,
  },
  compactAction: { minHeight: ACTION_ROW },
});
