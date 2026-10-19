import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radii, SCREEN_GUTTER, spacing } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** A softly pulsing placeholder block. */
export function Skeleton({ width = '100%', height = 14, radius = radii.sm, style }: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.set(withRepeat(withTiming(1, { duration: 900 }), -1, true));
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceMuted }, animatedStyle, style]}
    />
  );
}

export function PostCardSkeleton() {
  return (
    <View style={skeletonStyles.card} accessibilityLabel="Loading" accessible>
      <View style={skeletonStyles.row}>
        <Skeleton width={36} height={36} radius={18} />
        <View style={skeletonStyles.flex}>
          <Skeleton width="40%" height={12} />
          <Skeleton width="25%" height={10} style={skeletonStyles.gapTop} />
        </View>
      </View>
      <Skeleton height={undefined} radius={radii.md} style={skeletonStyles.image} />
      <Skeleton width="60%" height={18} />
      <Skeleton width="90%" height={12} />
    </View>
  );
}

export function GridSkeleton({ count = 9, columns = 3 }: { count?: number; columns?: number }) {
  return (
    <View style={skeletonStyles.grid} accessibilityLabel="Loading" accessible>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, padding: 1 }}>
          <Skeleton height={undefined} radius={0} style={skeletonStyles.square} />
        </View>
      ))}
    </View>
  );
}

export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading" accessible>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={skeletonStyles.listRow}>
          <Skeleton width={56} height={56} radius={radii.sm} />
          <View style={skeletonStyles.flex}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="30%" height={10} style={skeletonStyles.gapTop} />
          </View>
          <Skeleton width={34} height={34} radius={17} />
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: { paddingHorizontal: SCREEN_GUTTER, paddingVertical: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  gapTop: { marginTop: spacing.xs },
  image: { aspectRatio: 4 / 5, width: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  square: { aspectRatio: 1, width: '100%' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
});
