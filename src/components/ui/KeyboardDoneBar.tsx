import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

import { AppText } from './AppText';

/**
 * True while the software keyboard is on screen. Pass `enabled = false` to
 * skip listening (e.g. a sheet that isn't open), so hidden components don't
 * re-render on every keyboard change.
 */
export function useKeyboardVisible(enabled = true): boolean {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  // Re-read the keyboard when listening resumes; it may have changed meanwhile.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (enabled) setVisible(Keyboard.isVisible());
  }
  useEffect(() => {
    if (!enabled) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);
  return visible;
}

/**
 * A "Done" row shown only while the keyboard is up, for multiline fields
 * where Return adds a new line. Put it at the bottom of a layout that sits
 * above the keyboard (e.g. a BottomSheet), so it lands right on top of it.
 */
export function KeyboardDoneBar() {
  const visible = useKeyboardVisible();
  if (!visible) return null;
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => Keyboard.dismiss()}
        hitSlop={spacing.md}
        accessibilityRole="button"
        accessibilityLabel="Done"
        accessibilityHint="Hides the keyboard"
      >
        <AppText variant="calloutStrong" color="accent">
          Done
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
});
