import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, categoryColorFor, FoodImage, PressableScale, RatingDisplay } from '@/components/ui';
import { colors, fonts, SCREEN_GUTTER, spacing } from '@/theme';
import type { RankingItem } from '@/types/models';
import { formatCalendarDate } from '@/utils/dates';

function RankingRowBase({ item }: { item: RankingItem }) {
  const podium = item.rank <= 3;
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.postId } })}
      activeScale={0.98}
      accessibilityRole="link"
      accessibilityLabel={`Number ${item.rank}, ${item.title}, ${item.rating.toFixed(1)}`}
      style={styles.row}
    >
      <AppText style={[styles.rank, podium && styles.rankPodium]} accessibilityElementsHidden>
        {item.rank}
      </AppText>
      <FoodImage uri={item.thumbUrl} cacheKey={item.thumbPath ?? undefined} style={styles.thumb} radius="sm" />
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </AppText>
        <View style={styles.meta}>
          <View style={[styles.dot, { backgroundColor: categoryColorFor(item.primarySlug) }]} />
          <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.metaText}>
            {[item.secondaryName ?? item.primaryName, formatCalendarDate(item.madeOn)].join(' · ')}
          </AppText>
        </View>
      </View>
      <RatingDisplay value={item.rating} size="sm" />
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
    paddingVertical: spacing.sm + 2,
  },
  rank: {
    width: 30,
    textAlign: 'center',
    fontFamily: fonts.serif,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  rankPodium: { color: colors.text, fontSize: 22, lineHeight: 28 },
  thumb: { width: 56, height: 56 },
  text: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  metaText: { flexShrink: 1 },
});
