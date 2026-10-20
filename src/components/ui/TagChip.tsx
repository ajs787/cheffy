import { StyleSheet } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export interface TagChipProps {
  name: string;
  onPress?: () => void;
}

/** Lightweight tag label: "#oat milk". */
export function TagChip({ name, onPress }: TagChipProps) {
  return (
    <PressableScale
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'link' : 'text'}
      accessibilityLabel={`Tag ${name}`}
      style={styles.tag}
    >
      <AppText variant="caption" color="accent">
        #{name}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radii.pill,
    backgroundColor: colors.tint,
  },
});
