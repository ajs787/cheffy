import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, HAIRLINE, SCREEN_GUTTER, spacing } from '@/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

export interface AppHeaderProps {
  title?: string;
  /** Large editorial title, left-aligned (tab roots). */
  large?: boolean;
  /** 'back' (default when not large), 'close' for modals, or 'none'. */
  leading?: 'back' | 'close' | 'none';
  onLeadingPress?: () => void;
  right?: ReactNode;
  /** Adds the top safe-area inset (true unless inside a modal sheet). */
  safeTop?: boolean;
  bordered?: boolean;
}

export function AppHeader({
  title,
  large = false,
  leading = large ? 'none' : 'back',
  onLeadingPress,
  right,
  safeTop = true,
  bordered = false,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const handleLeading = onLeadingPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  if (large) {
    return (
      <View style={[styles.large, { paddingTop: (safeTop ? insets.top : 0) + spacing.sm }]}>
        <AppText variant="display" accessibilityRole="header" numberOfLines={1} style={styles.largeTitle}>
          {title}
        </AppText>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: safeTop ? insets.top : spacing.sm },
        bordered && styles.bordered,
      ]}
    >
      <View style={styles.side}>
        {leading !== 'none' ? (
          <IconButton
            icon={leading === 'close' ? X : ChevronLeft}
            label={leading === 'close' ? 'Close' : 'Back'}
            onPress={handleLeading}
          />
        ) : null}
      </View>
      <AppText variant="title3" numberOfLines={1} accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  large: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  largeTitle: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: -spacing.xs },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  bordered: { borderBottomWidth: HAIRLINE, borderBottomColor: colors.border },
  side: { minWidth: 88, flexDirection: 'row', alignItems: 'center' },
  sideRight: { justifyContent: 'flex-end', paddingRight: spacing.md },
  title: { flex: 1, textAlign: 'center' },
});
