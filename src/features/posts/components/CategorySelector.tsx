import { StyleSheet, View } from 'react-native';

import { AppText, categoryColorFor, CategoryIcon, PressableScale } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, radii, spacing } from '@/theme';
import type { Category } from '@/types/models';

export interface CategorySelectorProps {
  primaries: Category[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}

/** The three (or more) primary categories as equal, tappable cards. */
export function CategorySelector({ primaries, value, onChange, error }: CategorySelectorProps) {
  return (
    <View>
      <View style={styles.row} accessibilityRole="radiogroup">
        {primaries.map((primary) => {
          const selected = primary.id === value;
          const tint = categoryColorFor(primary.slug);
          return (
            <PressableScale
              key={primary.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={primary.name}
              onPress={() => {
                if (!selected) {
                  haptics.selection();
                  onChange(primary.id);
                }
              }}
              style={[styles.card, selected && { borderColor: tint, backgroundColor: colors.surface }]}
              testID={`category-${primary.slug}`}
            >
              <CategoryIcon slug={primary.slug} size="lg" color={selected ? tint : colors.textTertiary} />
              <AppText variant="calloutStrong" color={selected ? 'text' : 'textSecondary'}>
                {primary.name}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.md + 2,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  error: { marginTop: spacing.xs },
});
