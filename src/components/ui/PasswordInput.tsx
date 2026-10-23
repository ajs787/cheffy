import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, HIT_TARGET, iconSizes, strokes } from '@/theme';

import { AppInput, type AppInputProps } from './AppInput';

/**
 * A password field with a show/hide button. Hidden by default; the typed text
 * is kept when toggling (it's held in the field's value, not re-entered).
 */
export function PasswordInput(props: Omit<AppInputProps, 'secureTextEntry' | 'trailing'>) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <AppInput
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Icon size={iconSizes.md} color={colors.textTertiary} strokeWidth={strokes.regular} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  toggle: { minWidth: HIT_TARGET, minHeight: HIT_TARGET, alignItems: 'flex-end', justifyContent: 'center' },
});
