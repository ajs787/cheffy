import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTaxonomy } from '@/features/taxonomy/hooks';
import { colors, HAIRLINE, SCREEN_GUTTER, spacing } from '@/theme';
import { formatCount } from '@/utils/format';
import { formatRating, ratingTextColor } from '@/utils/rating';

import { useRatingSummary } from '../hooks';

/** Three numbers from your own ratings: how many, how good on average, what you make most. */
export function RankingSummary({ userId }: { userId: string }) {
  const summary = useRatingSummary(userId);
  const taxonomy = useTaxonomy();
  const data = summary.data;
  if (!data || data.count === 0) return null;
  const top = data.topPrimaryId ? taxonomy.data?.byId[data.topPrimaryId]?.name : undefined;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${data.count} creations, average ${formatRating(data.average)}${top ? `, most made ${top}` : ''}`}
    >
      <View style={styles.cell}>
        <AppText variant="title2">{formatCount(data.count)}</AppText>
        <AppText variant="overline" color="textSecondary">
          {data.count === 1 ? 'Creation' : 'Creations'}
        </AppText>
      </View>
      <View style={[styles.cell, styles.rule]}>
        <AppText variant="title2" style={{ color: ratingTextColor(data.average) }}>
          {formatRating(data.average)}
        </AppText>
        <AppText variant="overline" color="textSecondary">
          Average
        </AppText>
      </View>
      <View style={[styles.cell, styles.rule]}>
        <AppText variant="title2" numberOfLines={1}>
          {top ?? '—'}
        </AppText>
        <AppText variant="overline" color="textSecondary">
          Most made
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: SCREEN_GUTTER,
    borderTopWidth: HAIRLINE,
    borderBottomWidth: HAIRLINE,
    borderColor: colors.rule,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  rule: { borderLeftWidth: HAIRLINE, borderLeftColor: colors.rule },
});
