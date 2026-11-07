import { router } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppText, Wordmark } from '@/components/ui';
import { TAGLINE } from '@/constants/app';
import { PlayfulCategory } from '@/features/auth/components/PlayfulCategory';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

const CATEGORIES = [
  { slug: 'cooking', label: 'Cook', motion: 'wiggle' },
  { slug: 'baking', label: 'Bake', motion: 'bounce' },
  { slug: 'drinks', label: 'Pour', motion: 'tilt' },
] as const;

/** The wordmark scales with the screen so it never crowds a small iPhone. */
const wordmarkSize = (width: number) => Math.round(Math.min(84, Math.max(64, width * 0.21)));

/**
 * The first screen before signing in. Two groups: the hero (wordmark, one
 * line, and the playful Cook / Bake / Pour row that says what Cheffy is for),
 * centered in the spare height, and the actions with a small sign-off,
 * anchored at the bottom in thumb reach. It scrolls only when large
 * accessibility text needs the room.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xxxl, paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md },
      ]}
      bounces={false}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Animated.View entering={FadeInDown.duration(600)} style={styles.brand}>
          <Wordmark size={wordmarkSize(width)} />
          <AppText
            variant="title3"
            color="accent"
            align="center"
            // Wraps as balanced lines ("…has a / fan club now."), never a lone "now."
            lineBreakStrategyIOS="push-out"
            style={styles.headline}
          >
            {TAGLINE.headline}
          </AppText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.categories}>
          {CATEGORIES.map((c) => (
            <PlayfulCategory key={c.slug} slug={c.slug} label={c.label} motion={c.motion} />
          ))}
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.actions}>
        <AppButton label="Create account" size="lg" fullWidth onPress={() => router.push('/sign-up')} />
        <AppButton
          label="Sign in"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => router.push('/sign-in')}
        />
        <AppText variant="overline" color="textSecondary" align="center" style={styles.signoff}>
          Cook. Rate. Share. Repeat.
        </AppText>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: SCREEN_GUTTER + spacing.sm },
  // Takes the spare height. The bottom padding lifts the group a little above
  // true center, where it reads as centered.
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xxxl + spacing.lg,
    paddingVertical: spacing.xxl,
    paddingBottom: spacing.xxxl + spacing.xxl,
  },
  brand: { alignItems: 'center', gap: spacing.md },
  headline: { maxWidth: 280, lineHeight: 24, letterSpacing: 0.3 },
  // Centered with an even gap, so the row sits under the wordmark, not edge to edge.
  categories: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  actions: { gap: spacing.md },
  signoff: { marginTop: spacing.lg },
});
