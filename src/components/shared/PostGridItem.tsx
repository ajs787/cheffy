import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, FoodImage, PressableScale } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';
import type { Post } from '@/types/models';
import { formatRating, ratingTextColor } from '@/utils/rating';

export interface PostGridItemProps {
  post: Post;
  size: number;
  /** Rounded tiles with a caption (Discover) vs. flush squares (diary). */
  variant?: 'flush' | 'card';
  /** Cards only: a third line with the post's first tag or cuisine. */
  showDetail?: boolean;
}

/** "#matcha", else the first cuisine or dish type, else nothing. */
export function postDetailLine(post: Pick<Post, 'tags' | 'cuisines' | 'subcategories'>): string | null {
  const tag = post.tags[0];
  if (tag) return `#${tag.name}`;
  return post.cuisines[0]?.name ?? post.subcategories[0]?.name ?? null;
}

function PostGridItemBase({ post, size, variant = 'flush', showDetail = false }: PostGridItemProps) {
  const cover = post.images[0];
  const open = () => router.push({ pathname: '/post/[id]', params: { id: post.id } });
  const detail = showDetail ? postDetailLine(post) : null;

  return (
    <PressableScale
      onPress={open}
      activeScale={0.97}
      accessibilityRole="link"
      accessibilityLabel={`${post.title}, rated ${formatRating(post.rating)}`}
      style={variant === 'card' ? { width: size } : { width: size, height: size, padding: 1 }}
    >
      <View>
        {cover ? (
          <FoodImage
            uri={cover.thumbUrl}
            cacheKey={cover.thumbPath}
            radius={variant === 'card' ? 'md' : 0}
            style={{
              width: variant === 'card' ? size : size - 2,
              height: variant === 'card' ? size * 1.2 : size - 2,
            }}
          />
        ) : (
          <View
            style={[
              styles.textTile,
              {
                width: variant === 'card' ? size : size - 2,
                height: variant === 'card' ? size * 1.2 : size - 2,
              },
              variant === 'card' && styles.rounded,
            ]}
          >
            <AppText variant="calloutStrong" numberOfLines={4} align="center">
              {post.title}
            </AppText>
          </View>
        )}
        {post.rating !== null ? (
          <View style={styles.ratingPill}>
            <AppText style={[styles.ratingText, { color: ratingTextColor(post.rating) }]}>
              {formatRating(post.rating)}
            </AppText>
          </View>
        ) : null}
      </View>
      {variant === 'card' ? (
        <View style={styles.caption}>
          <AppText variant="calloutStrong" numberOfLines={1}>
            {post.title}
          </AppText>
          {/* Its own target: the creator opens their profile, the rest opens the post. */}
          <Pressable
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.author.id } })}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="link"
            accessibilityLabel={`@${post.author.username}, open profile`}
            style={styles.author}
          >
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              @{post.author.username}
            </AppText>
          </Pressable>
          {showDetail && detail ? (
            <AppText variant="caption" color="textTertiary" numberOfLines={1}>
              {detail}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </PressableScale>
  );
}

export const PostGridItem = memo(PostGridItemBase);

const styles = StyleSheet.create({
  textTile: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  rounded: { borderRadius: radii.md },
  ratingPill: {
    position: 'absolute',
    left: spacing.xs + 2,
    bottom: spacing.xs + 2,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  ratingText: { fontFamily: fonts.display, fontSize: 12, lineHeight: 16 },
  caption: { paddingTop: spacing.xs + 2, gap: 1 },
  author: { alignSelf: 'flex-start', maxWidth: '100%' },
});
