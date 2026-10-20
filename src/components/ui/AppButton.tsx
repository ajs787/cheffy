import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { colors, iconSizes, radii, spacing, strokes, type ColorToken } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

export interface AppButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

const VARIANTS: Record<Variant, { bg: string; border: string; text: ColorToken }> = {
  primary: { bg: colors.accentStrong, border: colors.accentStrong, text: 'textInverse' },
  secondary: { bg: 'transparent', border: colors.rule, text: 'text' },
  ghost: { bg: 'transparent', border: 'transparent', text: 'text' },
  destructive: { bg: 'transparent', border: colors.danger, text: 'danger' },
};

const SIZES: Record<Size, { height: number; paddingX: number }> = {
  sm: { height: 36, paddingX: spacing.md },
  md: { height: 48, paddingX: spacing.xl },
  lg: { height: 54, paddingX: spacing.xxl },
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityHint,
  testID,
}: AppButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const inactive = disabled || loading;

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        haptics.light();
        onPress?.();
      }}
      style={[
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.paddingX,
          backgroundColor: v.bg,
          borderColor: v.border,
          opacity: disabled ? 0.45 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[v.text]} />
      ) : (
        <View style={styles.content}>
          {Icon ? <Icon size={iconSizes.md} color={colors[v.text]} strokeWidth={strokes.bold} /> : null}
          <AppText variant={size === 'sm' ? 'calloutStrong' : 'button'} color={v.text} numberOfLines={1}>
            {label}
          </AppText>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Squared like a menu card, not a pill.
  base: {
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
