import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/stores/toast';
import { colors, iconSizes, radii, shadows, spacing, strokes } from '@/theme';

import { AppText } from './AppText';

const DURATION_MS = 2800;

/** Renders the current toast at the top of the screen. Mount once at the root. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const current = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!current) return;
    AccessibilityInfo.announceForAccessibility(current.message);
    const timer = setTimeout(() => dismiss(current.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [current, dismiss]);

  if (!current) return null;

  const Icon = current.tone === 'error' ? CircleAlert : current.tone === 'success' ? CircleCheck : null;

  return (
    <Animated.View
      key={current.id}
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.toast, { top: insets.top + spacing.sm }]}
    >
      {Icon ? (
        <Icon
          size={iconSizes.md}
          color={current.tone === 'error' ? colors.accent : colors.sage}
          strokeWidth={strokes.bold}
        />
      ) : null}
      <AppText variant="calloutStrong" color="textInverse" style={styles.text}>
        {current.message}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.text,
    zIndex: 1000,
    ...shadows.sm,
  },
  text: { flex: 1 },
});
