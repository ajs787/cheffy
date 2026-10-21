import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, iconSizes, spacing, strokes } from '@/theme';
import { formatRating } from '@/utils/rating';

import { fetchSharedFavorites } from '../experience';

/** "You both love Matcha" on a friend's profile — only when it's true. */
export function SharedFavorites({ friendId }: { friendId: string }) {
  const shared = useQuery({
    queryKey: ['shared-favorites', friendId],
    queryFn: () => fetchSharedFavorites(friendId),
    staleTime: 5 * 60_000,
  });
  const items = (shared.data ?? []).slice(0, 3);
  if (items.length === 0) return null;
  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`You both love ${items.map((i) => i.name).join(', ')}`}
    >
      <View style={styles.heading}>
        <Heart size={iconSizes.sm} color={colors.accent} fill={colors.accent} strokeWidth={strokes.bold} />
        <AppText variant="calloutStrong">You both love {items.map((i) => i.name).join(', ')}</AppText>
      </View>
      {items.map((item) => (
        <AppText key={item.categoryId} variant="caption" color="textSecondary" numberOfLines={1}>
          {item.name}: your {item.mine.title} ({formatRating(item.mine.rating)}) · their {item.theirs.title} (
          {formatRating(item.theirs.rating)})
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
});
