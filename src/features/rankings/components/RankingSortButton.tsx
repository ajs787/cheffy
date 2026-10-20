import { ArrowDownUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ActionSheet, AppText } from '@/components/ui';
import { colors, HIT_TARGET, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { RankingSort } from '@/types/models';

import { SORT_LABELS, type RankingsController } from '../useRankingsController';

const SORTS: RankingSort[] = ['highest', 'lowest', 'recent', 'oldest'];

/** The current sort, tappable to choose another. */
export function RankingSortButton({ controller }: { controller: RankingsController }) {
  const [open, setOpen] = useState(false);
  const { sort, setSort } = controller;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${SORT_LABELS[sort]}`}
      >
        <ArrowDownUp size={14} color={colors.textSecondary} strokeWidth={strokes.bold} />
        <AppText variant="calloutStrong" color="textSecondary">
          {SORT_LABELS[sort]}
        </AppText>
      </Pressable>
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Sort by"
        actions={SORTS.map((s) => ({
          key: s,
          label: SORT_LABELS[s],
          selected: s === sort,
          onPress: () => setSort(s),
        }))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: HIT_TARGET,
    paddingLeft: spacing.sm,
    // Header rows inset 4pt for icon buttons; text needs the full gutter.
    paddingRight: SCREEN_GUTTER - spacing.xs,
  },
});
