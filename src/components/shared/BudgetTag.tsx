import { PiggyBank } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, strokes } from '@/theme';
import { budgetLabel } from '@/utils/price';

/** "Budget Eats · ~$3.20 / serving" — compact metadata on tagged posts. */
export function BudgetTag({ costCents }: { costCents: number | null }) {
  const label = budgetLabel(costCents);
  return (
    <View style={styles.row} accessible accessibilityLabel={label.replace('~', 'about ')}>
      <PiggyBank size={12} color={colors.textSecondary} strokeWidth={strokes.bold} />
      <AppText variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
