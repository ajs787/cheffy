import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppText, CategoryIcon } from '@/components/ui';
import { colors, fonts, SCREEN_GUTTER, spacing } from '@/theme';

const CATEGORIES = [
  { slug: 'cooking', label: 'Cooking' },
  { slug: 'baking', label: 'Baking' },
  { slug: 'drinks', label: 'Drinks' },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.huge, paddingBottom: insets.bottom + spacing.lg }]}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
        <AppText style={styles.wordmark} accessibilityRole="header">
          Cheffy
        </AppText>
        <AppText variant="title2" style={styles.tagline}>
          Everything you make deserves to be remembered.
        </AppText>
        <AppText variant="body" color="textSecondary" style={styles.body}>
          Log what you cook, bake and pour. Rate it, rank it, and see what your friends are making.
        </AppText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).duration(500)} style={styles.categories}>
        {CATEGORIES.map((c) => (
          <View key={c.slug} style={styles.category}>
            <View style={styles.categoryIcon}>
              <CategoryIcon slug={c.slug} size="lg" />
            </View>
            <AppText variant="caption" color="textSecondary">
              {c.label}
            </AppText>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.actions}>
        <AppButton label="Create an account" size="lg" fullWidth onPress={() => router.push('/sign-up')} />
        <AppButton label="I already have an account" variant="ghost" fullWidth onPress={() => router.push('/sign-in')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: SCREEN_GUTTER + spacing.sm,
    justifyContent: 'space-between',
  },
  hero: { gap: spacing.lg },
  wordmark: { fontFamily: fonts.serif, fontSize: 56, lineHeight: 62, letterSpacing: -1.2, color: colors.accentStrong },
  tagline: { fontSize: 26, lineHeight: 32, maxWidth: 320 },
  body: { maxWidth: 320 },
  categories: { flexDirection: 'row', gap: spacing.xxl, justifyContent: 'center' },
  category: { alignItems: 'center', gap: spacing.sm },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: spacing.xs },
});
