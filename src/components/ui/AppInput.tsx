import type { LucideIcon } from 'lucide-react-native';
import { useState, type ComponentRef, type Ref, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, iconSizes, MAX_FONT_SCALE, radii, spacing, strokes } from '@/theme';

import { AppText } from './AppText';

export interface AppInputProps extends Omit<TextInputProps, 'style'> {
  ref?: Ref<ComponentRef<typeof TextInput>>;
  label?: string;
  error?: string;
  helper?: string;
  icon?: LucideIcon;
  /** Shows a live character counter when set with maxLength. */
  showCount?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
  /** 'boxed' (default) or 'bare' for inline editorial fields. */
  appearance?: 'boxed' | 'bare';
  /** Shown after the text, inside the field (e.g. a show-password button). */
  trailing?: ReactNode;
}

export function AppInput({
  ref,
  label,
  error,
  helper,
  icon: Icon,
  showCount,
  maxLength,
  value,
  multiline,
  containerStyle,
  inputStyle,
  appearance = 'boxed',
  trailing,
  onFocus,
  onBlur,
  ...rest
}: AppInputProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.text : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText variant="calloutStrong" color="text" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          appearance === 'boxed' ? styles.boxed : styles.bare,
          appearance === 'boxed' && { borderColor },
          multiline && styles.multiline,
        ]}
      >
        {Icon ? (
          <Icon
            size={iconSizes.md}
            color={colors.textTertiary}
            strokeWidth={strokes.regular}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          ref={ref}
          value={value}
          maxLength={maxLength}
          multiline={multiline}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          accessibilityLabel={label ?? rest.placeholder}
          accessibilityHint={error ?? helper}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMultiline, inputStyle]}
          {...rest}
        />
        {trailing}
      </View>
      {error || helper || (showCount && maxLength) ? (
        <View style={styles.footer}>
          <AppText variant="caption" color={error ? 'danger' : 'textSecondary'} style={styles.footerText}>
            {error ?? helper ?? ''}
          </AppText>
          {showCount && maxLength ? (
            <AppText variant="caption" color="textTertiary">
              {(value?.length ?? 0).toString()}/{maxLength}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { marginBottom: spacing.xxs },
  boxed: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  bare: { flexDirection: 'row', alignItems: 'center' },
  multiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  icon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  footerText: { flex: 1 },
});
