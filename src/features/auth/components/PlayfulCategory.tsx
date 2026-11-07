import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText, CategoryIcon } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, spacing } from '@/theme';

export type PlayfulMotion = 'wiggle' | 'bounce' | 'tilt';

const quick = (toValue: number, duration = 70) =>
  withTiming(toValue, { duration, easing: Easing.out(Easing.quad) });
const settle = { damping: 9, stiffness: 220, mass: 0.6 };

/** Diameter of the crème disc behind each icon. */
const DISC = 64;

/**
 * A welcome-screen category that plays a small, characterful animation when
 * tapped: the pot wiggles, the cake hops, the cup tips as if pouring. Every
 * tap restarts it. With Reduce Motion on it only dims briefly. The soft disc
 * (which deepens while pressed) says it can be touched.
 */
export function PlayfulCategory({
  slug,
  label,
  motion,
}: {
  slug: string;
  label: string;
  motion: PlayfulMotion;
}) {
  const reduceMotion = useReducedMotion();
  const rotate = useSharedValue(0);
  const lift = useSharedValue(0);
  const opacity = useSharedValue(1);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: lift.get() }, { rotate: `${rotate.get()}deg` }],
  }));

  const play = () => {
    haptics.light();
    for (const value of [rotate, lift, opacity]) cancelAnimation(value);
    if (reduceMotion) {
      opacity.set(withSequence(withTiming(0.45, { duration: 90 }), withTiming(1, { duration: 180 })));
      return;
    }
    rotate.set(0);
    lift.set(0);
    switch (motion) {
      case 'wiggle':
        rotate.set(withSequence(quick(-9), quick(9), quick(-6), quick(6), quick(-3), withSpring(0, settle)));
        break;
      case 'bounce':
        lift.set(
          withSequence(
            withTiming(-12, { duration: 140, easing: Easing.out(Easing.cubic) }),
            withSpring(0, settle),
          ),
        );
        rotate.set(withSequence(quick(-7, 140), withSpring(0, settle)));
        break;
      case 'tilt':
        rotate.set(
          withSequence(
            withTiming(-28, { duration: 220, easing: Easing.out(Easing.cubic) }),
            withTiming(-28, { duration: 160 }),
            withSpring(0, settle),
          ),
        );
        break;
    }
  };

  return (
    <Pressable
      onPress={play}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Plays a little animation"
      testID={`welcome-${slug}`}
    >
      {({ pressed }) => (
        <>
          <Animated.View style={[styles.disc, pressed && styles.discPressed, iconStyle]}>
            <CategoryIcon slug={slug} size="xl" />
          </Animated.View>
          <AppText variant="overline" align="center">
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Equal columns so the three labels share one optical baseline and rhythm.
  container: { width: DISC + spacing.xxl, alignItems: 'center', gap: spacing.sm + 2 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  discPressed: { backgroundColor: colors.surfacePressed },
});
