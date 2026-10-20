import { ChevronDown, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { colors, HAIRLINE, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';

import { AppText } from './AppText';

export interface CollapsibleProps {
  title: string;
  /** One line under the title: what's inside, or what's been filled in. */
  summary?: string;
  icon?: LucideIcon;
  initiallyOpen?: boolean;
  children: ReactNode;
  testID?: string;
}

/**
 * An optional form section: a single tappable row that opens in place.
 * Keeps quick logging short while every extra stays one tap away.
 */
export function Collapsible({
  title,
  summary,
  icon: Icon,
  initiallyOpen = false,
  children,
  testID,
}: CollapsibleProps) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        accessibilityHint={summary}
        testID={testID}
      >
        {Icon ? <Icon size={iconSizes.md} color={colors.accent} strokeWidth={strokes.regular} /> : null}
        <View style={styles.text}>
          <AppText variant="bodyStrong">{title}</AppText>
          {summary ? (
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {summary}
            </AppText>
          ) : null}
        </View>
        <ChevronDown
          size={iconSizes.md}
          color={colors.textSecondary}
          strokeWidth={strokes.bold}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.body}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: HAIRLINE, borderTopColor: colors.rule, marginHorizontal: SCREEN_GUTTER },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  pressed: { opacity: 0.6 },
  text: { flex: 1, gap: 2 },
  // Children manage their own gutters, so the body cancels the section's.
  body: { marginHorizontal: -SCREEN_GUTTER, paddingBottom: spacing.lg },
});
