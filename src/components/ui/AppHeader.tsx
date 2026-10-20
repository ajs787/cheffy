import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, HAIRLINE, SCREEN_GUTTER, spacing } from '@/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { Wordmark } from './Wordmark';

/**
 * - `brand`: the wordmark with actions (Home only — the logo appears once).
 * - `large`: an editorial screen title with actions (Discover, My Rankings).
 * - `nav`: back/close, a centered title and actions (pushed screens, Create,
 *   Profile "@username").
 */
export type HeaderVariant = 'brand' | 'large' | 'nav';

export interface AppHeaderProps {
  variant?: HeaderVariant;
  title?: string;
  /** Leading control for `nav`: 'back' (default), 'close' for modals, or 'none' (tab roots). */
  leading?: 'back' | 'close' | 'none';
  onLeadingPress?: () => void;
  /** Icon buttons or a compact control on the trailing side. */
  right?: ReactNode;
  /** Adds the top safe-area inset. Pass false inside a sheet that already has one. */
  safeTop?: boolean;
  bordered?: boolean;
}

export function AppHeader({
  variant = 'nav',
  title,
  leading = 'back',
  onLeadingPress,
  right,
  safeTop = true,
  bordered = false,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const top = safeTop ? insets.top : 0;
  const handleLeading = onLeadingPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  if (variant === 'brand') {
    return (
      <View style={[styles.brand, { paddingTop: top }, bordered && styles.bordered]}>
        <Wordmark size={30} />
        <View style={styles.actions}>{right}</View>
      </View>
    );
  }

  if (variant === 'large') {
    return (
      <View style={[styles.large, { paddingTop: top + spacing.md }, bordered && styles.bordered]}>
        <AppText variant="display" accessibilityRole="header" numberOfLines={1} style={styles.largeTitle}>
          {title}
        </AppText>
        {right ? <View style={styles.actions}>{right}</View> : null}
      </View>
    );
  }

  return (
    <View style={[styles.bar, { paddingTop: safeTop ? insets.top : spacing.sm }, bordered && styles.bordered]}>
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
  brand: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: SCREEN_GUTTER,
    paddingRight: spacing.xs,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  large: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingLeft: SCREEN_GUTTER,
    paddingRight: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  largeTitle: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
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
