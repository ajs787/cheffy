import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, HIT_TARGET, iconSizes, radii, strokes } from '@/theme';

import { PressableScale } from './PressableScale';

export interface IconButtonProps {
  icon: LucideIcon;
  /** Required: icon-only buttons need a spoken label. */
  label: string;
  onPress?: () => void;
  color?: string;
  size?: keyof typeof iconSizes;
  filled?: boolean;
  fillColor?: string;
  variant?: 'plain' | 'surface' | 'scrim';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  color = colors.text,
  size = 'lg',
  filled = false,
  fillColor,
  variant = 'plain',
  disabled,
  style,
  testID,
}: IconButtonProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      onPress={onPress}
      disabled={disabled}
      activeScale={0.9}
      style={[styles.base, variant === 'surface' && styles.surface, variant === 'scrim' && styles.scrim, style]}
    >
      <Icon
        size={iconSizes[size]}
        color={variant === 'scrim' ? colors.textInverse : color}
        fill={filled ? (fillColor ?? color) : 'transparent'}
        strokeWidth={strokes.regular}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 40,
    minHeight: 40,
  },
  scrim: {
    backgroundColor: colors.imageScrim,
    minWidth: 36,
    minHeight: 36,
  },
});
