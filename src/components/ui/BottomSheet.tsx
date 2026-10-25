import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, durations, radii, SCREEN_GUTTER, spacing, springs } from '@/theme';

import { AppText } from './AppText';
import { useKeyboardVisible } from './KeyboardDoneBar';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called once the sheet's modal is fully gone (safe to present another modal). */
  onClosed?: () => void;
  title?: string;
  children: ReactNode;
  /** Extra bottom padding is added for the home indicator automatically. */
  contentPadding?: boolean;
  accessibilityLabel?: string;
  /**
   * Drag to dismiss from the handle and title only, so a ScrollView in the
   * content can scroll freely. Use for sheets with scrolling or text fields.
   */
  dragFromHandleOnly?: boolean;
}

const OFFSCREEN = 900;

/**
 * Modal sheet that slides up from the bottom. Drag the handle (or the sheet)
 * down, or tap the backdrop, to dismiss. It rises above the keyboard, and
 * while the keyboard is up a backdrop tap only hides the keyboard, so typed
 * text is never lost to a stray tap.
 */
export function BottomSheet({
  visible,
  onClose,
  onClosed,
  title,
  children,
  contentPadding = true,
  accessibilityLabel,
  dragFromHandleOnly = false,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  // Above the keyboard the home-indicator inset is covered anyway; drop it.
  const keyboardUp = useKeyboardVisible();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);
  const sheetHeight = useSharedValue(OFFSCREEN);

  // Mount as soon as we become visible (adjusting state during render, not in an effect).
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible || !mounted) return;
    backdrop.set(withTiming(0, { duration: durations.fast }));
    translateY.set(
      withTiming(sheetHeight.get(), { duration: durations.normal }, (finished) => {
        if (finished) {
          // Next open measures again and animates in from the new height.
          sheetHeight.set(OFFSCREEN);
          scheduleOnRN(setMounted, false);
        }
      }),
    );
  }, [visible, mounted, backdrop, translateY, sheetHeight]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    const firstLayout = sheetHeight.get() === OFFSCREEN;
    sheetHeight.set(height);
    if (firstLayout && visible) {
      translateY.set(height);
      backdrop.set(withTiming(1, { duration: durations.normal }));
      translateY.set(reduceMotion ? 0 : withSpring(0, springs.sheet));
    }
  };

  const pan = usePanGesture({
    activeOffsetY: [-10, 10],
    onUpdate: (event) => {
      translateY.set(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      const shouldClose = event.translationY > sheetHeight.get() * 0.28 || event.velocityY > 900;
      if (shouldClose) {
        scheduleOnRN(onClose);
      } else {
        translateY.set(withSpring(0, springs.sheet));
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  // Android has no Modal onDismiss, so report closure when the modal unmounts.
  useEffect(() => {
    if (!mounted && Platform.OS !== 'ios') onClosed?.();
  }, [mounted, onClosed]);

  const top = (
    <>
      <View style={styles.handle} />
      {title ? (
        <AppText variant="title3" align="center" style={styles.title} accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
    </>
  );
  const sheet = (
    <Animated.View
      onLayout={handleLayout}
      accessibilityViewIsModal
      accessibilityLabel={accessibilityLabel ?? title}
      style={[
        styles.sheet,
        {
          paddingBottom: keyboardUp
            ? spacing.md
            : (contentPadding ? spacing.lg : 0) + Math.max(insets.bottom, spacing.md),
        },
        sheetStyle,
      ]}
    >
      {dragFromHandleOnly ? (
        <GestureDetector gesture={pan}>
          <View>{top}</View>
        </GestureDetector>
      ) : (
        top
      )}
      <View style={[contentPadding && styles.content, styles.body]}>{children}</View>
    </Animated.View>
  );

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={onClosed}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (Keyboard.isVisible() ? Keyboard.dismiss() : onClose())}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.root}
          pointerEvents="box-none"
        >
          {dragFromHandleOnly ? sheet : <GestureDetector gesture={pan}>{sheet}</GestureDetector>}
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg + 4,
    borderTopRightRadius: radii.lg + 4,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  title: { marginBottom: spacing.md, paddingHorizontal: SCREEN_GUTTER },
  content: { paddingHorizontal: SCREEN_GUTTER },
  // Lets a ScrollView in the content shrink to fit above the keyboard.
  body: { flexShrink: 1 },
});
