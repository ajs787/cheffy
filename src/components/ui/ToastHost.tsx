import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/stores/toast';
import { colors, HAIRLINE, radii, shadows, spacing } from '@/theme';

import { AppText } from './AppText';
import { Monogram } from './Monogram';

const DURATION_MS = 2800;

/**
 * The identity's notification card: monogram tile, "CHEFFY · NOW" label,
 * message. Mount once at the root.
 */
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

  return (
    <Animated.View
      key={current.id}
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.toast, { top: insets.top + spacing.sm }, current.tone === 'error' && styles.error]}
    >
      <Monogram size={36} />
      <View style={styles.text}>
        <AppText variant="overline" color={current.tone === 'error' ? 'danger' : 'textSecondary'}>
          {current.tone === 'error' ? 'Cheffy · Couldn’t do that' : 'Cheffy · Now'}
        </AppText>
        <AppText variant="callout" numberOfLines={3}>
          {current.message}
        </AppText>
      </View>
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
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.sm,
    borderWidth: HAIRLINE,
    borderColor: colors.rule,
    backgroundColor: colors.surface,
    zIndex: 1000,
    ...shadows.sm,
  },
  error: { borderColor: colors.danger },
  text: { flex: 1, gap: 2 },
});
