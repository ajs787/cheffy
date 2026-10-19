import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { colors, HAIRLINE, spacing, springs } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Editorial underline tabs used inside screens (e.g. Diary / Rankings / Collections). */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segmentWidth = options.length > 0 ? width / options.length : 0;

  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: withSpring(index * segmentWidth, springs.press) }],
  }));

  return (
    <View
      style={styles.container}
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            activeScale={0.98}
            onPress={() => {
              if (!selected) {
                haptics.selection();
                onChange(option.value);
              }
            }}
            style={styles.segment}
          >
            <AppText variant="calloutStrong" color={selected ? 'text' : 'textTertiary'}>
              {option.label}
            </AppText>
          </PressableScale>
        );
      })}
      <Animated.View style={[styles.indicator, indicatorStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: HAIRLINE,
    borderBottomColor: colors.border,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  indicator: { position: 'absolute', bottom: -HAIRLINE, left: 0, height: 2, backgroundColor: colors.text },
});
