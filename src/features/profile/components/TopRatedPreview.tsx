import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, FoodImage, PressableScale, RatingRing } from '@/components/ui';
import { useRankings } from '@/features/rankings/hooks';
import { colors, fonts, iconSizes, spacing, strokes } from '@/theme';

// Same params as the Rankings tab's default, so both share one cached query.
const TOP = { primaryId: null, categoryId: null, tagId: null, sort: 'highest' } as const;

/**
 * Someone's three highest-rated creations, compact. Renders nothing until
 * there's something to show (or when the viewer can't see their content).
 */
export function TopRatedPreview({ userId, onSeeAll }: { userId: string; onSeeAll: () => void }) {
  const rankings = useRankings(userId, TOP);
  const top = (rankings.data?.pages[0]?.items ?? []).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onSeeAll}
        style={styles.heading}
        accessibilityRole="button"
        accessibilityLabel="See all rankings"
      >
        <AppText variant="overline" color="textSecondary">
          Top rated
        </AppText>
        <View style={styles.seeAll}>
          <AppText variant="caption" color="textSecondary">
            Rankings
          </AppText>
          <ChevronRight size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
        </View>
      </Pressable>
      <View style={styles.row}>
        {top.map((item) => (
          <PressableScale
            key={item.postId}
            onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.postId } })}
            activeScale={0.97}
            style={styles.item}
            accessibilityRole="link"
            accessibilityLabel={`Number ${item.rank}, ${item.title}, rated ${item.rating}`}
          >
            <View>
              <FoodImage
                uri={item.thumbUrl}
                cacheKey={item.thumbPath ?? undefined}
                style={styles.thumb}
                radius="md"
              />
              <View style={styles.ring}>
                <RatingRing value={item.rating} size="sm" />
              </View>
              <View style={styles.rankBadge}>
                <AppText style={styles.rank}>{item.rank}</AppText>
              </View>
            </View>
            <AppText variant="caption" numberOfLines={1}>
              {item.title}
            </AppText>
          </PressableScale>
        ))}
        {/* Keep three equal columns when someone has fewer. */}
        {Array.from({ length: 3 - top.length }, (_, i) => (
          <View key={`spacer-${i}`} style={styles.item} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', gap: spacing.sm },
  item: { flex: 1, gap: spacing.xs },
  thumb: { width: '100%', aspectRatio: 4 / 3 },
  ring: { position: 'absolute', right: spacing.xs, bottom: spacing.xs },
  // Oxblood badge so the rank reads on any photo.
  rankBadge: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  rank: { fontFamily: fonts.display, fontSize: 15, lineHeight: 19, color: colors.ivory },
});
