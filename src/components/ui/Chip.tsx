import { Check, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { colors, radii, spacing, strokes } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  leading?: ReactNode;
  /** Multi-select pickers: show a check when selected, so state isn't color-only. */
  checkable?: boolean;
  size?: 'sm' | 'md';
  accessibilityHint?: string;
  testID?: string;
}

export function Chip({
  label,
  selected = false,
  onPress,
  onRemove,
  leading,
  checkable = false,
  size = 'md',
  accessibilityHint,
  testID,
}: ChipProps) {
  const content = (
    <>
      {checkable && selected ? (
        <Check size={size === 'sm' ? 12 : 14} color={colors.accent} strokeWidth={strokes.bold} />
      ) : (
        leading
      )}
      <AppText variant={size === 'sm' ? 'caption' : 'calloutStrong'} color={selected ? 'text' : 'textSecondary'}>
        {label}
      </AppText>
      {onRemove ? <X size={14} color={colors.textSecondary} strokeWidth={strokes.bold} /> : null}
    </>
  );

  const style = [
    styles.base,
    size === 'sm' ? styles.sm : styles.md,
    selected ? styles.selected : styles.unselected,
  ];

  const handlePress = onPress ?? onRemove;
  if (!handlePress) {
    return <View style={style}>{content}</View>;
  }

  return (
    <PressableScale
      testID={testID}
      accessibilityRole={onRemove && !onPress ? 'button' : 'togglebutton'}
      accessibilityLabel={onRemove && !onPress ? `Remove ${label}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={onPress ? { selected } : undefined}
      hitSlop={4}
      onPress={() => {
        haptics.selection();
        handlePress();
      }}
      style={style}
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  md: { height: 36, paddingHorizontal: spacing.md + 2 },
  sm: { height: 28, paddingHorizontal: spacing.sm + 2 },
  unselected: { backgroundColor: colors.surface, borderColor: colors.border },
  selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
});
