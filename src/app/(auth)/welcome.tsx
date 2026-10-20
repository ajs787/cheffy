import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppText, CategoryIcon, Wordmark } from '@/components/ui';
import { colors, HAIRLINE, SCREEN_GUTTER, spacing } from '@/theme';

const CATEGORIES = [
  { slug: 'cooking', label: 'Cook' },
  { slug: 'baking', label: 'Bake' },
  { slug: 'drinks', label: 'Pour' },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.masthead}>
        <AppText variant="overline">Club de cuisine</AppText>
        <AppText variant="overline">Est. MMXXVI</AppText>
      </View>

      <Animated.View entering={FadeInDown.duration(600)} style={styles.hero}>
        <Wordmark size={84} />
        <AppText variant="body" color="textSecondary" align="center" style={styles.tagline}>
          A private table for people who cook, bake, whisk, and keep notes.
        </AppText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.categories}>
        {CATEGORIES.map((c, i) => (
          <View key={c.slug} style={[styles.category, i > 0 && styles.categoryRule]}>
            <CategoryIcon slug={c.slug} size="lg" />
            <AppText variant="overline">{c.label}</AppText>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(350).duration(600)} style={styles.actions}>
        <AppButton label="Join the table" size="lg" fullWidth onPress={() => router.push('/sign-up')} />
        <AppButton label="I already have an account" variant="ghost" fullWidth onPress={() => router.push('/sign-in')} />
        <AppText variant="overline" color="textTertiary" align="center" style={styles.motto}>
          Cook. Note. Share. Repeat.
        </AppText>
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
  masthead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: HAIRLINE,
    borderBottomColor: colors.rule,
  },
  hero: { alignItems: 'center', gap: spacing.lg },
  tagline: { maxWidth: 280 },
  categories: {
    flexDirection: 'row',
    borderTopWidth: HAIRLINE,
    borderBottomWidth: HAIRLINE,
    borderColor: colors.rule,
  },
  category: { flex: 1, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  categoryRule: { borderLeftWidth: HAIRLINE, borderLeftColor: colors.rule },
  actions: { gap: spacing.xs },
  motto: { marginTop: spacing.md },
});
