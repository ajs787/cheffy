import { Heart } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import { colors, iconSizes, spacing, springs, strokes } from '@/theme';
import { formatCount } from '@/utils/format';

export interface LikeButtonProps {
  liked: boolean;
  count: number;
  onToggle: () => void;
  /** Layout overrides (e.g. a shorter row; hitSlop keeps the touch area). */
  style?: StyleProp<ViewStyle>;
}

export function LikeButton({ liked, count, onToggle, style }: LikeButtonProps) {
  const scale = useSharedValue(1);
  const wasLiked = useRef(liked);

  useEffect(() => {
    if (liked && !wasLiked.current) {
      scale.set(withSequence(withTiming(1.28, { duration: 90 }), withSpring(1, springs.pop)));
    }
    wasLiked.current = liked;
  }, [liked, scale]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: liked }}
      accessibilityLabel={liked ? `Unlike. ${count} likes` : `Like. ${count} likes`}
      style={[styles.button, style]}
      testID="like-button"
    >
      <Animated.View style={iconStyle}>
        <Heart
          size={iconSizes.lg}
          color={liked ? colors.accent : colors.text}
          fill={liked ? colors.accent : 'transparent'}
          strokeWidth={strokes.regular}
        />
      </Animated.View>
      {count > 0 ? (
        <AppText variant="calloutStrong" testID="like-count">
          {formatCount(count)}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 44,
    paddingRight: spacing.sm,
  },
});
