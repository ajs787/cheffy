import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/lib/haptics';
import { colors, iconSizes, MAX_FONT_SCALE, radii, shadows, spacing, springs, strokes, typography } from '@/theme';
import {
  formatRating,
  parseRatingInput,
  RATING_MAX,
  ratingColor,
  ratingDescriptor,
  stepRating,
} from '@/utils/rating';

import { AppText } from './AppText';

export interface RatingInputProps {
  value: number | null;
  onChange: (value: number) => void;
  error?: string;
}

const THUMB = 28;
const TICKS = Array.from({ length: RATING_MAX + 1 }, (_, i) => i);

/**
 * The 0.0–10.0 rating control. Three ways in, all equally precise:
 * drag/tap the slider (haptic tick at every whole number), nudge with
 * −/+ (0.1 steps, hold to repeat), or tap the number and type it.
 */
export function RatingInput({ value, onChange, error }: RatingInputProps) {
  const reduceMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const position = useSharedValue(value === null ? 0 : value / RATING_MAX);
  const width = useSharedValue(0);
  const dragging = useSharedValue(false);
  const lastTenths = useSharedValue(value === null ? -1 : Math.round(value * 10));
  const numberScale = useSharedValue(1);

  const color = ratingColor(value);

  // Keep the thumb in sync with changes that don't come from dragging.
  useEffect(() => {
    if (dragging.get() || value === null) return;
    position.set(reduceMotion ? value / RATING_MAX : withSpring(value / RATING_MAX, springs.press));
    lastTenths.set(Math.round(value * 10));
  }, [value, dragging, position, lastTenths, reduceMotion]);

  useEffect(() => {
    if (value === null || reduceMotion) return;
    numberScale.set(withSequence(withTiming(1.05, { duration: 70 }), withSpring(1, springs.pop)));
  }, [value, numberScale, reduceMotion]);

  useEffect(() => () => stopRepeat(), []);

  const commitFromPosition = (tenths: number) => {
    onChange(tenths / 10);
  };

  const updateFromX = (x: number) => {
    'worklet';
    const w = width.get();
    if (w <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / w));
    const tenths = Math.round(ratio * RATING_MAX * 10);
    position.set(tenths / (RATING_MAX * 10));
    const previous = lastTenths.get();
    if (tenths !== previous) {
      const crossedWhole = previous >= 0 && Math.floor(tenths / 10) !== Math.floor(previous / 10);
      lastTenths.set(tenths);
      if (crossedWhole || tenths === 0 || tenths === 100) scheduleOnRN(haptics.selection);
      scheduleOnRN(commitFromPosition, tenths);
    }
  };

  const pan = usePanGesture({
    activeOffsetX: [-4, 4],
    failOffsetY: [-12, 12],
    onActivate: (event) => {
      dragging.set(true);
      updateFromX(event.x);
    },
    onUpdate: (event) => {
      updateFromX(event.x);
    },
    onFinalize: () => {
      dragging.set(false);
    },
  });

  const tap = useTapGesture({
    onDeactivate: (event) => {
      if (!event.canceled) updateFromX(event.x);
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  const fillStyle = useAnimatedStyle(() => ({ width: position.value * width.value }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * width.value - THUMB / 2 }],
  }));
  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: numberScale.value }] }));

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    width.set(w);
    setTrackWidth(w);
  };

  const step = (direction: 1 | -1) => {
    const current = valueRef.current ?? (direction > 0 ? 0 : RATING_MAX);
    const next = valueRef.current === null ? current : stepRating(current, direction);
    if (next !== valueRef.current) {
      haptics.selection();
      onChange(next);
    }
  };

  const startRepeat = (direction: 1 | -1) => {
    stopRepeat();
    repeatTimer.current = setInterval(() => step(direction), 70);
  };

  function stopRepeat() {
    if (repeatTimer.current) clearInterval(repeatTimer.current);
    repeatTimer.current = null;
  }

  const beginEditing = () => {
    setDraft(value === null ? '' : formatRating(value));
    setEditing(true);
  };

  const finishEditing = () => {
    const parsed = parseRatingInput(draft);
    setEditing(false);
    if (parsed !== null) {
      haptics.light();
      onChange(parsed);
    } else if (draft.trim() !== '') {
      haptics.error();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.readout}>
        {editing ? (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onBlur={finishEditing}
            onSubmitEditing={finishEditing}
            keyboardType="decimal-pad"
            returnKeyType="done"
            maxLength={4}
            selectTextOnFocus
            placeholder="9.2"
            placeholderTextColor={colors.borderStrong}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            accessibilityLabel="Exact rating, from 0 to 10"
            style={[typography.rating, styles.numberInput, { color }]}
            selectionColor={colors.accent}
            testID="rating-exact-input"
          />
        ) : (
          <Pressable
            onPress={beginEditing}
            accessibilityRole="button"
            accessibilityLabel={
              value === null ? 'No rating yet. Tap to type a rating' : `Rating ${formatRating(value)}. Tap to type`
            }
            testID="rating-number"
          >
            <Animated.View style={numberStyle}>
              {/* Unrated: a ghosted 0.0 placeholder (the descriptor says "Slide to rate"). */}
              <AppText variant="rating" style={{ color: value === null ? colors.border : color }}>
                {value === null ? '0.0' : formatRating(value)}
              </AppText>
            </Animated.View>
          </Pressable>
        )}
        <AppText variant="calloutStrong" color={error ? 'danger' : 'textSecondary'}>
          {error ?? ratingDescriptor(value)}
        </AppText>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={() => step(-1)}
          onLongPress={() => startRepeat(-1)}
          onPressOut={stopRepeat}
          delayLongPress={300}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Decrease rating by 0.1"
          style={({ pressed }) => [styles.stepper, pressed && styles.stepperPressed]}
          testID="rating-decrement"
        >
          <Minus size={iconSizes.md} color={colors.text} strokeWidth={strokes.bold} />
        </Pressable>

        <GestureDetector gesture={gesture}>
          <View
            style={styles.trackArea}
            onLayout={handleTrackLayout}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Rating slider"
            accessibilityValue={{ min: 0, max: 10, now: value ?? 0, text: formatRating(value) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) => {
              const current = value ?? 0;
              const next = stepRating(current, event.nativeEvent.actionName === 'increment' ? 5 : -5);
              onChange(next);
            }}
          >
            <View style={styles.track}>
              <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
            </View>
            <View style={styles.ticks} pointerEvents="none">
              {TICKS.map((tick) => (
                <View key={tick} style={[styles.tick, tick % 5 === 0 && styles.tickMajor]} />
              ))}
            </View>
            {trackWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.thumb,
                  { borderColor: value === null ? colors.borderStrong : color },
                  thumbStyle,
                ]}
              />
            ) : null}
          </View>
        </GestureDetector>

        <Pressable
          onPress={() => step(1)}
          onLongPress={() => startRepeat(1)}
          onPressOut={stopRepeat}
          delayLongPress={300}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Increase rating by 0.1"
          style={({ pressed }) => [styles.stepper, pressed && styles.stepperPressed]}
          testID="rating-increment"
        >
          <Plus size={iconSizes.md} color={colors.text} strokeWidth={strokes.bold} />
        </Pressable>
      </View>
      <View style={styles.scale} pointerEvents="none">
        <AppText variant="caption" color="textTertiary">
          0
        </AppText>
        <AppText variant="caption" color="textTertiary">
          5
        </AppText>
        <AppText variant="caption" color="textTertiary">
          10
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  readout: { alignItems: 'center', gap: spacing.xxs },
  numberInput: { minWidth: 160, textAlign: 'center', padding: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepper: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperPressed: { backgroundColor: colors.surfacePressed },
  trackArea: { flex: 1, height: 44, justifyContent: 'center' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
  ticks: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tick: { width: 1, height: 4, backgroundColor: colors.border },
  tickMajor: { height: 7, backgroundColor: colors.borderStrong },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.surface,
    borderWidth: 2.5,
    ...shadows.sm,
  },
  scale: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 52 },
});
