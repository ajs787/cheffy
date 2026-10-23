import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, HAIRLINE, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import { formatRating } from '@/utils/rating';

import { fetchSharedFavorites } from '../experience';

/**
 * "You both love …" on a friend's profile — only when it's true. One chip per
 * shared favorite in a horizontal row, so any number of them (and long
 * names) scroll instead of being cut off.
 */
export function SharedFavorites({ friendId }: { friendId: string }) {
  const shared = useQuery({
    queryKey: ['shared-favorites', friendId],
    queryFn: () => fetchSharedFavorites(friendId),
    staleTime: 5 * 60_000,
  });
  const items = shared.data ?? [];
  if (items.length === 0) return null;
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Heart size={iconSizes.sm} color={colors.accent} fill={colors.accent} strokeWidth={strokes.bold} />
        <AppText variant="calloutStrong" accessibilityRole="header">
          You both love
        </AppText>
      </View>
      {/* Bleeds to the screen edges; padding lets the last chip scroll fully into view. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => (
          <View
            key={item.categoryId}
            style={styles.chip}
            accessible
            accessibilityLabel={`${item.name}: your ${item.mine.title}, ${formatRating(item.mine.rating)}; their ${item.theirs.title}, ${formatRating(item.theirs.rating)}`}
          >
            <AppText variant="calloutStrong" numberOfLines={1}>
              {item.name}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              You: {item.mine.title} · {formatRating(item.mine.rating)}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              Them: {item.theirs.title} · {formatRating(item.theirs.rating)}
            </AppText>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const CHIP_MAX = 220;

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  bleed: { marginHorizontal: -SCREEN_GUTTER },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  chip: {
    maxWidth: CHIP_MAX,
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
