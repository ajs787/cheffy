import { Heart } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
  /** Opens who liked it. When set, only the heart toggles the like; the count opens the list. */
  onPressCount?: () => void;
  /** Layout overrides (e.g. a shorter row; hitSlop keeps the touch area). */
  style?: StyleProp<ViewStyle>;
}

export function LikeButton({ liked, count, onToggle, onPressCount, style }: LikeButtonProps) {
  const scale = useSharedValue(1);
  const wasLiked = useRef(liked);

  useEffect(() => {
    if (liked && !wasLiked.current) {
      scale.set(withSequence(withTiming(1.28, { duration: 90 }), withSpring(1, springs.pop)));
    }
    wasLiked.current = liked;
  }, [liked, scale]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const heart = (
    <Animated.View style={iconStyle}>
      <Heart
        size={iconSizes.lg}
        color={liked ? colors.accent : colors.text}
        fill={liked ? colors.accent : 'transparent'}
        strokeWidth={strokes.regular}
      />
    </Animated.View>
  );
  const countText =
    count > 0 ? (
      <AppText variant="calloutStrong" testID="like-count">
        {formatCount(count)}
      </AppText>
    ) : null;

  if (onPressCount && count > 0) {
    // Two targets side by side, so opening the list can't toggle the like.
    return (
      <View style={[styles.button, styles.split, style]}>
        <Pressable
          onPress={onToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 2 }}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
          style={styles.heart}
          testID="like-button"
        >
          {heart}
        </Pressable>
        <Pressable
          onPress={onPressCount}
          hitSlop={{ top: 8, bottom: 8, left: 2, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`${count} ${count === 1 ? 'like' : 'likes'}`}
          accessibilityHint="Shows who liked this"
          style={styles.count}
          testID="like-count-button"
        >
          {countText}
        </Pressable>
      </View>
    );
  }

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
      {heart}
      {countText}
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
  split: { gap: 0, paddingRight: 0 },
  heart: { minHeight: 44, justifyContent: 'center', paddingRight: spacing.xs + 2 },
  count: { minHeight: 44, minWidth: 28, justifyContent: 'center', paddingRight: spacing.sm },
});
