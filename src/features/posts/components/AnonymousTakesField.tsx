import { ChefHat } from 'lucide-react-native';
import { StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, iconSizes, spacing, strokes } from '@/theme';
import type { Visibility } from '@/types/models';

/**
 * Create/Edit Entry: lets other chefs comment as "Chef #01" instead of
 * their profile. Turning it off stops new anonymous takes; the ones
 * already posted stay.
 */
export function AnonymousTakesField({
  value,
  onChange,
  visibility,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  visibility: Visibility;
}) {
  const isPublic = visibility === 'public';
  return (
    <View style={styles.row}>
      <ChefHat size={iconSizes.md} color={colors.text} strokeWidth={strokes.regular} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">Allow Anonymous Takes</AppText>
        <AppText variant="caption" color="textSecondary">
          {isPublic
            ? 'Let other chefs share candid feedback without showing their profiles.'
            : 'Let other chefs share candid feedback without showing their profiles. Only on public posts.'}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.border }}
        accessibilityLabel="Allow Anonymous Takes"
        accessibilityHint="Lets other chefs comment without showing their profiles"
        testID="compose-anonymous-takes"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, marginTop: spacing.md },
  flex: { flex: 1 },
});
