import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, CategoryChip, Chip } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';
import { pluralize } from '@/utils/format';

import type { RankingsController } from '../useRankingsController';
import { RankingSortButton } from './RankingSortButton';

/**
 * Primary category chips, then chips for the cuisines/subcategories/tags the
 * person has actually used. `inlineSort` adds the count + sort row (profiles);
 * the Rankings tab puts sort in its header instead.
 */
export function RankingFilters({
  controller,
  inlineSort = true,
}: {
  controller: RankingsController;
  inlineSort?: boolean;
}) {
  const { taxonomy, primaryId, setPrimaryId, secondary, setSecondary, secondaryOptions, total, rankings } =
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

      {inlineSort ? (
        <View style={styles.summary}>
          <AppText variant="caption" color="textSecondary">
            {rankings.isPending ? ' ' : pluralize(total, 'creation')}
          </AppText>
          <RankingSortButton controller={controller} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The parent sets the space around the block; this only spaces its rows.
  container: { gap: spacing.md },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: SCREEN_GUTTER,
    paddingRight: spacing.xs,
  },
});
