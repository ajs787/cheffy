import { Heart } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { FlatList, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { GestureDetector, useTapGesture, useExclusiveGestures } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { FoodImage } from '@/components/ui';
import { colors, spacing, springs } from '@/theme';
import type { PostImage } from '@/types/models';

export const FEED_IMAGE_ASPECT = 4 / 5;

export interface ImageCarouselProps {
  images: PostImage[];
  width: number;
  title: string;
  /** Single tap, with the page showing. */
  onPress?: (index: number) => void;
  onDoubleTap?: () => void;
  priority?: 'high' | 'normal';
}

/** Swipeable photo pager with page dots and double-tap-to-like. */
export function ImageCarousel({ images, width, title, onPress, onDoubleTap, priority }: ImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const height = width / FEED_IMAGE_ASPECT;
  const heartScale = useSharedValue(0);
  const listRef = useRef<FlatList<PostImage>>(null);
  const indexRef = useRef(0);
  const pressCurrent = () => onPress?.(indexRef.current);

  const burst = () => {
    'worklet';
    heartScale.set(
      withSequence(withSpring(1, springs.pop), withDelay(350, withTiming(0, { duration: 180 }))),
    );
  };

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (event) => {
      if (event.canceled) return;
      burst();
      if (onDoubleTap) scheduleOnRN(onDoubleTap);
    },
  });
  const singleTap = useTapGesture({
    onDeactivate: (event) => {
      if (!event.canceled && onPress) scheduleOnRN(pressCurrent);
    },
  });
  const taps = useExclusiveGestures(doubleTap, singleTap);

  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartScale.value,
    transform: [{ scale: 0.6 + heartScale.value * 0.6 }],
  }));

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    indexRef.current = next;
    if (next !== index) setIndex(next);
  };

  if (images.length === 0) return null;

  return (
    <View>
      <GestureDetector gesture={taps}>
        <View style={{ width, height }}>
          <FlatList
            ref={listRef}
            data={images}
            keyExtractor={(image) => image.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            scrollEnabled={images.length > 1}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            renderItem={({ item, index: i }) => (
              <FoodImage
                uri={item.url ?? item.thumbUrl}
                cacheKey={item.url ? item.storagePath : item.thumbPath}
                radius={0}
                priority={i === 0 ? priority : 'low'}
                style={{ width, height }}
                accessibilityLabel={`${title}, photo ${i + 1} of ${images.length}`}
              />
            )}
          />
          <Animated.View pointerEvents="none" style={[styles.heart, heartStyle]}>
            <Heart size={88} color={colors.surface} fill={colors.surface} strokeWidth={1} />
          </Animated.View>
        </View>
      </GestureDetector>
      {images.length > 1 ? (
        <View style={styles.dots} accessibilityElementsHidden>
          {images.map((image, i) => (
            <View key={image.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heart: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingTop: spacing.sm },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotActive: { backgroundColor: colors.text },
});
