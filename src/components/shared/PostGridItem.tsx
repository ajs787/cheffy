import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, FoodImage, PressableScale } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';
import type { Post } from '@/types/models';
import { formatRating, ratingColor } from '@/utils/rating';

export interface PostGridItemProps {
  post: Post;
  size: number;
  /** Rounded tiles with a caption (Discover) vs. flush squares (diary). */
  variant?: 'flush' | 'card';
}

function PostGridItemBase({ post, size, variant = 'flush' }: PostGridItemProps) {
  const cover = post.images[0];
  const open = () => router.push({ pathname: '/post/[id]', params: { id: post.id } });

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
            style={{ width: variant === 'card' ? size : size - 2, height: variant === 'card' ? size * 1.2 : size - 2 }}
          />
        ) : (
          <View
            style={[
              styles.textTile,
              { width: variant === 'card' ? size : size - 2, height: variant === 'card' ? size * 1.2 : size - 2 },
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
            <AppText style={[styles.ratingText, { color: ratingColor(post.rating) }]}>{formatRating(post.rating)}</AppText>
          </View>
        ) : null}
      </View>
      {variant === 'card' ? (
        <View style={styles.caption}>
          <AppText variant="calloutStrong" numberOfLines={1}>
            {post.title}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            @{post.author.username}
          </AppText>
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
  ratingText: { fontFamily: fonts.serif, fontSize: 12, lineHeight: 16 },
  caption: { paddingTop: spacing.xs + 2, gap: 1 },
});
