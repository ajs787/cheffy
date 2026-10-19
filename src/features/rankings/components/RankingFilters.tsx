import { ArrowDownUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ActionSheet, AppText, CategoryChip, Chip } from '@/components/ui';
import { colors, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { RankingSort } from '@/types/models';
import { pluralize } from '@/utils/format';

import { SORT_LABELS, type RankingsController } from '../useRankingsController';

const SORTS: RankingSort[] = ['highest', 'lowest', 'recent', 'oldest'];

export function RankingFilters({ controller }: { controller: RankingsController }) {
  const [sortOpen, setSortOpen] = useState(false);
  const { taxonomy, primaryId, setPrimaryId, secondary, setSecondary, secondaryOptions, sort, setSort, total, rankings } =
    controller;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip label="All" selected={primaryId === null} onPress={() => setPrimaryId(null)} />
        {(taxonomy.data?.primaries ?? []).map((primary) => (
          <CategoryChip
            key={primary.id}
            slug={primary.slug}
            label={primary.name}
            selected={primaryId === primary.id}
            onPress={() => setPrimaryId(primaryId === primary.id ? null : primary.id)}
          />
        ))}
      </ScrollView>

      {secondaryOptions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {secondaryOptions.map((option) => (
            <Chip
              key={`${option.kind}:${option.id}`}
              size="sm"
              label={option.kind === 'tag' ? `#${option.name}` : option.name}
              selected={secondary?.id === option.id}
              onPress={() => setSecondary(secondary?.id === option.id ? null : option)}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.summary}>
        <AppText variant="caption" color="textSecondary">
          {rankings.isPending ? ' ' : pluralize(total, 'creation')}
        </AppText>
        <Pressable
          onPress={() => setSortOpen(true)}
          hitSlop={10}
          style={styles.sort}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${SORT_LABELS[sort]}`}
        >
          <ArrowDownUp size={14} color={colors.textSecondary} strokeWidth={strokes.bold} />
          <AppText variant="calloutStrong" color="textSecondary">
            {SORT_LABELS[sort]}
          </AppText>
        </Pressable>
      </View>

      <ActionSheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Sort by"
        actions={SORTS.map((s) => ({
          key: s,
          label: `${SORT_LABELS[s]}${s === sort ? '  ✓' : ''}`,
          onPress: () => setSort(s),
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm + 2, paddingBottom: spacing.xs },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.xs,
  },
  sort: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
});
