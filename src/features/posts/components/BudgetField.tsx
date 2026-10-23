import { PiggyBank } from 'lucide-react-native';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui';
import {
  colors,
  fonts,
  HAIRLINE,
  iconSizes,
  MAX_FONT_SCALE,
  radii,
  SCREEN_GUTTER,
  spacing,
  strokes,
} from '@/theme';

/**
 * Budget Eats: an optional tag for affordable homemade food, with an optional
 * estimated cost per serving in USD. No receipts or ingredient list needed.
 */
export function BudgetField({
  enabled,
  onToggle,
  defaultCost,
  onCostChange,
  error,
}: {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  defaultCost: string;
  onCostChange: (value: string) => void;
  error?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <PiggyBank size={iconSizes.md} color={colors.text} strokeWidth={strokes.regular} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">Budget Eats</AppText>
          <AppText variant="caption" color="textSecondary">
            Tag it as an affordable homemade meal
          </AppText>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ true: colors.accent, false: colors.border }}
          accessibilityLabel="Budget Eats"
        />
      </View>
      {enabled ? (
        <View style={styles.costBlock}>
          <View style={[styles.cost, error ? styles.costError : null]}>
            <AppText variant="bodyStrong" color="textSecondary">
              $
            </AppText>
            <TextInput
              defaultValue={defaultCost}
              onChangeText={onCostChange}
              placeholder="3.20"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              maxLength={7}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              accessibilityLabel="Estimated cost per serving, in dollars (optional)"
              style={styles.costInput}
            />
            <AppText variant="callout" color="textSecondary">
              / serving
            </AppText>
          </View>
          <AppText variant="caption" color={error ? 'danger' : 'textTertiary'}>
            {error ?? 'Optional estimate. Leave blank if you’re not sure.'}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  flex: { flex: 1, gap: 2 },
  costBlock: { gap: spacing.xs, paddingLeft: iconSizes.md + spacing.md },
  cost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  costError: { borderColor: colors.danger },
  costInput: {
    minWidth: 64,
    fontFamily: fonts.text,
    fontSize: 17,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
});
