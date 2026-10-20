import { Globe, Lock, Users, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, iconSizes, radii, spacing, strokes } from '@/theme';
import type { Visibility } from '@/types/models';

export const VISIBILITY_OPTIONS: {
  value: Visibility;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { value: 'public', label: 'Public', description: 'Anyone on Cheffy', icon: Globe },
  { value: 'followers', label: 'Followers', description: 'Your followers', icon: Users },
  { value: 'private', label: 'Only me', description: 'Just your diary', icon: Lock },
];

export function VisibilitySelector({
  value,
  onChange,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {VISIBILITY_OPTIONS.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label}: ${option.description}`}
            onPress={() => {
              haptics.selection();
              onChange(option.value);
            }}
            style={[styles.option, selected && styles.selected]}
          >
            <Icon
              size={iconSizes.md}
              color={selected ? colors.text : colors.textTertiary}
              strokeWidth={strokes.regular}
            />
            <AppText variant="calloutStrong" color={selected ? 'text' : 'textSecondary'}>
              {option.label}
            </AppText>
            <AppText variant="caption" color="textTertiary" align="center" numberOfLines={1}>
              {option.description}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  selected: { borderColor: colors.text, backgroundColor: colors.surface },
});
