import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts, MAX_FONT_SCALE } from '@/theme';
import { formatRating, RATING_COLOR_STOPS, RATING_COLOR_VALUES, ratingFill } from '@/utils/rating';

import { AppText } from './AppText';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const RING_SIZES = { sm: 36, md: 44, lg: 58 } as const;

export interface RatingRingProps {
  value: number | null;
  size?: keyof typeof RING_SIZES;
}

const STOPS = RATING_COLOR_STOPS;
const STOP_COLORS = RATING_COLOR_VALUES;

/**
 * A rating as a circular progress ring: filled to rating / 10 from 12 o'clock,
 * colored from muted red (low) to deep green (high), with the number in the
 * middle so it never relies on color alone. Animates only when the value
 * changes (not on mount), and snaps with Reduce Motion.
 */
export function RatingRing({ value, size = 'md' }: RatingRingProps) {
  const reduceMotion = useReducedMotion();
  const d = RING_SIZES[size];
  // ~20% heavier than V3's 3 / 3.5; the radius subtracts it, so nothing clips.
  const stroke = size === 'lg' ? 4.2 : 3.6;
  const r = (d - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  const rating = value ?? 0;
  const progress = useSharedValue(rating);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    progress.set(
      reduceMotion ? rating : withTiming(rating, { duration: 450, easing: Easing.out(Easing.cubic) }),
    );
  }, [rating, reduceMotion, progress]);

  const arcProps = useAnimatedProps(() => {
    const p = progress.get();
    return {
      strokeDashoffset: circumference * (1 - Math.min(Math.max(p, 0), 10) / 10),
      stroke: interpolateColor(p, STOPS, STOP_COLORS),
    };
  });

  const label = value === null ? 'Not rated' : `Rated ${formatRating(value)} out of 10`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: d, height: d }}>
      <Svg width={d} height={d} style={StyleSheet.absoluteFill}>
        <Circle cx={d / 2} cy={d / 2} r={r} stroke={colors.tint} strokeWidth={stroke} fill={colors.surface} />
        {value !== null && ratingFill(value) > 0 ? (
          <AnimatedCircle
            cx={d / 2}
            cy={d / 2}
            r={r}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            fill="none"
            // Start at 12 o'clock.
            transform={`rotate(-90 ${d / 2} ${d / 2})`}
            animatedProps={arcProps}
          />
        ) : null}
      </Svg>
      <View style={styles.center}>
        <AppText
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.number, { fontSize: d * 0.34, lineHeight: d * 0.42 }]}
        >
          {formatRating(value)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { fontFamily: fonts.display, color: colors.text, fontVariant: ['tabular-nums'] },
});
