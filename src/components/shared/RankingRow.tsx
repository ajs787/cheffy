import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, categoryColorFor, FoodImage, PressableScale, RatingDisplay } from '@/components/ui';
import { colors, fonts, SCREEN_GUTTER, spacing } from '@/theme';
import type { RankingItem } from '@/types/models';
import { formatCalendarDate } from '@/utils/dates';
import { formatRating } from '@/utils/rating';

function RankingRowBase({ item }: { item: RankingItem }) {
  const podium = item.rank <= 3;
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.postId } })}
      activeScale={0.98}
      accessibilityRole="link"
      accessibilityLabel={`Number ${item.rank}, ${item.title}, rated ${formatRating(item.rating)}`}
      style={styles.row}
    >
      <AppText style={[styles.rank, podium && styles.rankPodium]} accessibilityElementsHidden>
        {item.rank}
      </AppText>
      <FoodImage
        uri={item.thumbUrl}
        cacheKey={item.thumbPath ?? undefined}
        style={styles.thumb}
        radius="md"
      />
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </AppText>
        <View style={styles.meta}>
          <View style={[styles.dot, { backgroundColor: categoryColorFor(item.primarySlug) }]} />
          {/* One line, date first: the date stays whole and long classifications end in one ellipsis. */}
          <AppText variant="overline" color="textSecondary" numberOfLines={1} style={styles.metaText}>
            {formatCalendarDate(item.madeOn)} · {item.secondaryName ?? item.primaryName}
          </AppText>
        </View>
      </View>
      <View style={styles.fixed}>
        <RatingDisplay value={item.rating} size="md" />
      </View>
    </PressableScale>
  );
}

export const RankingRow = memo(RankingRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
  rank: {
    minWidth: 28,
    flexShrink: 0,
    textAlign: 'center',
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 26,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  rankPodium: { color: colors.accent, fontSize: 24, lineHeight: 30 },
  thumb: { width: 64, height: 64, flexShrink: 0 },
  // Only the text column flexes; rank, photo and ring keep their size.
  text: { flex: 1, minWidth: 0, gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  metaText: { flex: 1 },
  fixed: { flexShrink: 0 },
});
