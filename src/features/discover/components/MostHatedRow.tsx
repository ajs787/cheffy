import { router } from 'expo-router';
import { memo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { AppText, FoodImage, PressableScale, RatingRing } from '@/components/ui';
import { colors, fonts, SCREEN_GUTTER, spacing } from '@/theme';
import type { Post } from '@/types/models';
import { formatRating } from '@/utils/rating';

import { useMostHated } from '../hooks';

const CARD_WIDTH = 132;

/**
 * "Most Hated": the week's lowest self-rated creations. Every rating here is
 * the cook's own verdict, so the tone is affectionate, never a judgement of
 * the person. Renders nothing until the database says there's enough.
 */
export function MostHatedRow() {
  const section = useMostHated();
  const posts = section.data ?? [];
  if (posts.length === 0) return null;

  return (
    <View style={styles.band}>
      <SectionHeader title="Most Hated" subtitle="The week’s most controversial creations." />
      <FlatList
        horizontal
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item, index }) => <HatedCard post={item} rank={index + 1} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        initialNumToRender={4}
      />
      <AppText variant="caption" color="textTertiary" style={styles.footnote}>
        Rated by the cooks themselves. Honesty is the secret ingredient.
      </AppText>
    </View>
  );
}

const HatedCard = memo(function HatedCard({ post, rank }: { post: Post; rank: number }) {
  const cover = post.images[0];
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
      activeScale={0.97}
      accessibilityRole="link"
      accessibilityLabel={`${post.title} by @${post.author.username}, rated ${formatRating(post.rating)} by its cook`}
      style={styles.card}
    >
      <View>
        <FoodImage uri={cover?.thumbUrl ?? null} cacheKey={cover?.thumbPath} radius="md" style={styles.photo} />
        <View style={styles.rank}>
          <AppText style={styles.rankText}>{rank}</AppText>
        </View>
        <View style={styles.ring}>
          <RatingRing value={post.rating} size="sm" />
        </View>
      </View>
      <View style={styles.caption}>
        <AppText variant="calloutStrong" numberOfLines={2}>
          {post.title}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          @{post.author.username}
        </AppText>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  // A crème band sets the section apart without a new visual style.
  band: {
    backgroundColor: colors.tint,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    marginBottom: spacing.xxl,
  },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
  card: { width: CARD_WIDTH },
  photo: { width: CARD_WIDTH, height: CARD_WIDTH },
  rank: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  rankText: { fontFamily: fonts.display, fontSize: 13, lineHeight: 17, color: colors.ivory },
  ring: { position: 'absolute', right: spacing.xs, bottom: spacing.xs },
  caption: { gap: 2, paddingTop: spacing.sm },
  footnote: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.md },
});
