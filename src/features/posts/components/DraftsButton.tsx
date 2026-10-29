import { ChevronRight, NotebookPen } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale } from '@/components/ui';
import { colors, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import { pluralize } from '@/utils/format';

/** Create's way back to saved drafts, with how many are waiting. */
export function DraftsButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Drafts, ${pluralize(count, 'saved draft')}` : 'Drafts'}
      style={styles.row}
      testID="compose-drafts"
    >
      <NotebookPen size={iconSizes.md} color={colors.textSecondary} strokeWidth={strokes.regular} />
      <AppText variant="calloutStrong" style={styles.label}>
        Drafts
      </AppText>
      {count > 0 ? (
        <View style={styles.badge} testID="compose-drafts-count">
          <AppText variant="caption" color="textInverse">
            {count}
          </AppText>
        </View>
      ) : null}
      <ChevronRight size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: SCREEN_GUTTER,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: { flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
