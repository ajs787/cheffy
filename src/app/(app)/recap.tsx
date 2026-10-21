import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppHeader,
  AppText,
  categoryColorFor,
  EmptyState,
  ErrorState,
  RatingRing,
  RowSkeleton,
} from '@/components/ui';
import { useRecap, useUnlocks } from '@/features/unlocks/hooks';
import { recapView } from '@/features/unlocks/rules';
import { colors, HAIRLINE, radii, SCREEN_GUTTER, spacing } from '@/theme';
import { formatCalendarDate } from '@/utils/dates';
import { formatRating } from '@/utils/rating';

/** A personal look back, built only from the person's own real entries. */
export default function RecapScreen() {
  const insets = useSafeAreaInsets();
  const unlocks = useUnlocks();
  const unlocked = unlocks.data?.unlocked.includes('recap') ?? false;
  const recap = useRecap(unlocked);

  if (unlocks.isPending || (unlocked && recap.isPending)) {
    return (
      <View style={styles.screen}>
        <AppHeader title="Your recap" />
        <RowSkeleton />
      </View>
    );
  }
  if (!unlocked) {
    return (
      <View style={styles.screen}>
        <AppHeader title="Your recap" />
        <EmptyState
          icon={Lock}
          title="Your recap unlocks at 10 creations"
          message={`You’re at ${unlocks.data?.creations ?? 0}. Keep logging what you make.`}
        />
      </View>
    );
  }
  if (recap.isError || !recap.data) {
    return (
      <View style={styles.screen}>
        <AppHeader title="Your recap" />
        <ErrorState error={recap.error} onRetry={() => void recap.refetch()} />
      </View>
    );
  }

  const v = recapView(recap.data);
  return (
    <View style={styles.screen}>
      <AppHeader title="Your recap" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.hero}>
          <AppText variant="overline" color="accent">
            {v.since ? `Since ${formatCalendarDate(v.since)}` : 'So far'}
          </AppText>
          <AppText variant="display">{v.total} creations</AppText>
          {v.average !== null ? (
            <AppText variant="callout" color="textSecondary">
              Averaging {formatRating(v.average)} out of 10
            </AppText>
          ) : null}
        </View>

        <View style={styles.block}>
          <AppText variant="overline" color="textSecondary">
            Cooking · Baking · Drinks
          </AppText>
          <View
            style={styles.bar}
            accessible
            accessibilityLabel={v.distribution.map((d) => `${d.count} ${d.name}`).join(', ')}
          >
            {v.distribution.map((d) => (
              <View key={d.slug} style={{ flex: d.share, backgroundColor: categoryColorFor(d.slug) }} />
            ))}
          </View>
          <View style={styles.legend}>
            {v.distribution.map((d) => (
              <View key={d.slug} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: categoryColorFor(d.slug) }]} />
                <AppText variant="callout">
                  {d.count} {d.name}
                </AppText>
              </View>
            ))}
          </View>
          {v.mostMade ? (
            <AppText variant="callout" color="textSecondary">
              Mostly {v.mostMade.name.toLowerCase()} — {Math.round(v.mostMade.share * 100)}% of what you make.
            </AppText>
          ) : null}
        </View>

        {v.top ? (
          <Pressable
            onPress={() => router.push({ pathname: '/post/[id]', params: { id: v.top!.postId } })}
            style={styles.block}
            accessibilityRole="link"
          >
            <AppText variant="overline" color="textSecondary">
              Highest rated
            </AppText>
            <View style={styles.topRow}>
              <AppText variant="title2" style={styles.flex} numberOfLines={2}>
                {v.top.title}
              </AppText>
              <RatingRing value={v.top.rating} size="md" />
            </View>
          </Pressable>
        ) : null}

        {v.cuisines ? (
          <View style={styles.block}>
            <AppText variant="overline" color="textSecondary">
              Favorite cuisines
            </AppText>
            {v.cuisines.map((c) => (
              <AppText key={c.name} variant="body">
                {c.name}{' '}
                <AppText variant="callout" color="textSecondary">
                  · {c.count}
                </AppText>
              </AppText>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: SCREEN_GUTTER, gap: spacing.lg },
  hero: { gap: spacing.xs, paddingVertical: spacing.md },
  block: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
