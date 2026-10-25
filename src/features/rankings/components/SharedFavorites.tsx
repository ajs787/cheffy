import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, PressableScale } from '@/components/ui';
import { colors, HAIRLINE, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import { formatRating } from '@/utils/rating';

import { fetchSharedFavorites, type SharedFavorite } from '../experience';

/**
 * "You both love …" on a friend's profile — only when it's true. One card per
 * shared favorite in a horizontal row. Names and dish titles wrap (cards in a
 * row share the tallest card's height) and each dish opens its post, so a
 * title that's still too long can always be read in full.
 */
export function SharedFavorites({ friendId }: { friendId: string }) {
  const shared = useQuery({
    queryKey: ['shared-favorites', friendId],
    queryFn: () => fetchSharedFavorites(friendId),
    staleTime: 5 * 60_000,
  });
  const { width } = useWindowDimensions();
  const items = shared.data ?? [];
  if (items.length === 0) return null;
  // Wide enough to read, narrow enough that the next card peeks in.
  const cardWidth = Math.min(CARD_MAX, Math.round(width * 0.68));
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Heart size={iconSizes.sm} color={colors.accent} fill={colors.accent} strokeWidth={strokes.bold} />
        <AppText variant="calloutStrong" accessibilityRole="header">
          You both love
        </AppText>
      </View>
      {/* Bleeds to the screen edges; padding lets the last card scroll fully into view. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => (
          <View key={item.categoryId} style={[styles.card, { width: cardWidth }]}>
            <AppText variant="calloutStrong" numberOfLines={2}>
              {item.name}
            </AppText>
            <Dish who="You" dish={item.mine} />
            <Dish who="Them" dish={item.theirs} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Dish({ who, dish }: { who: 'You' | 'Them'; dish: SharedFavorite['mine'] }) {
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: dish.postId } })}
      accessibilityRole="link"
      accessibilityLabel={`${who === 'You' ? 'Your' : 'Their'} ${dish.title}, ${formatRating(dish.rating)}`}
      accessibilityHint="Opens the post"
      style={styles.dish}
    >
      <AppText variant="caption" color="textTertiary">
        {who} · {formatRating(dish.rating)}
      </AppText>
      <AppText variant="caption" color="textSecondary" numberOfLines={3}>
        {dish.title}
      </AppText>
    </PressableScale>
  );
}

const CARD_MAX = 260;

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  bleed: { marginHorizontal: -SCREEN_GUTTER },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  card: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dish: { gap: 1 },
});
