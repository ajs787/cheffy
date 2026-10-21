import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui';
import type { ViewerImage } from '@/stores/imageViewer';
import { colors, iconSizes, spacing, strokes } from '@/theme';

export const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_DISTANCE = 140;
const DISMISS_VELOCITY = 900;
const snap = { damping: 22, stiffness: 240, mass: 0.7 };

export interface ZoomableImageProps {
  image: ViewerImage;
  /** Resolved full-resolution URL (may arrive after the thumbnail). */
  uri: string | null;
  width: number;
  height: number;
  /** False when another page is showing: resets zoom. */
  active: boolean;
  /** Vertical drag while not zoomed, shared with the viewer to fade the backdrop. */
  dismissY: SharedValue<number>;
  onZoomChange: (zoomed: boolean) => void;
  onDismiss: () => void;
}

/**
 * One photo in the viewer. Pinch zooms around the fingers (up to 4×),
 * double-tap toggles 2.5× at the tapped point, pan moves around while zoomed
 * and flicks with momentum. At 1× a vertical drag (or single tap) dismisses;
 * horizontal swipes fall through to the pager.
 */
export function ZoomableImage({
  image,
  uri,
  width,
  height,
  active,
  dismissY,
  onZoomChange,
  onDismiss,
}: ZoomableImageProps) {
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // The photo's size when fitted to the screen (contain).
  const aspect = image.width && image.height ? image.width / image.height : width / height;
  const fitW = Math.min(width, height * aspect);
  const fitH = fitW / aspect;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const isZoomed = useSharedValue(false);

  const reportZoom = (next: boolean) => {
    setZoomed(next);
    onZoomChange(next);
  };

  const maxX = (s: number) => {
    'worklet';
    return Math.max(0, (fitW * s - width) / 2);
  };
  const maxY = (s: number) => {
    'worklet';
    return Math.max(0, (fitH * s - height) / 2);
  };
  const clamp = (v: number, limit: number) => {
    'worklet';
    return Math.min(limit, Math.max(-limit, v));
  };
  const settle = (s: number) => {
    'worklet';
    const next = s > 1.01;
    if (!next) {
      scale.set(withSpring(1, snap));
      tx.set(withSpring(0, snap));
      ty.set(withSpring(0, snap));
    } else {
      tx.set(withSpring(clamp(tx.get(), maxX(s)), snap));
      ty.set(withSpring(clamp(ty.get(), maxY(s)), snap));
    }
    if (next !== isZoomed.get()) {
      isZoomed.set(next);
      scheduleOnRN(reportZoom, next);
    }
  };

  const pinch = usePinchGesture({
    onActivate: (e) => {
      savedScale.set(scale.get());
      savedTx.set(tx.get());
      savedTy.set(ty.get());
      originX.set(e.focalX - width / 2);
      originY.set(e.focalY - height / 2);
    },
    onUpdate: (e) => {
      const s = Math.min(MAX_SCALE, Math.max(0.8, savedScale.get() * e.scale));
      const k = s / savedScale.get();
      // Keep the point under the fingers fixed, and follow them as they move.
      tx.set(originX.get() * (1 - k) + savedTx.get() * k + (e.focalX - width / 2 - originX.get()));
      ty.set(originY.get() * (1 - k) + savedTy.get() * k + (e.focalY - height / 2 - originY.get()));
      scale.set(s);
    },
    onDeactivate: () => {
      settle(Math.max(1, scale.get()));
    },
  });

  const pan = usePanGesture({
    maxPointers: 1,
    // At 1× only vertical drags start here; horizontal ones page the viewer.
    // (No object spread: the worklets plugin can't workletize it.)
    minDistance: zoomed ? 4 : undefined,
    activeOffsetY: zoomed ? undefined : [-12, 12],
    failOffsetX: zoomed ? undefined : [-12, 12],
    onActivate: () => {
      savedTx.set(tx.get());
      savedTy.set(ty.get());
    },
    onUpdate: (e) => {
      if (isZoomed.get()) {
        const s = scale.get();
        tx.set(clamp(savedTx.get() + e.translationX, maxX(s)));
        ty.set(clamp(savedTy.get() + e.translationY, maxY(s)));
      } else {
        dismissY.set(e.translationY);
      }
    },
    onDeactivate: (e) => {
      if (isZoomed.get()) {
        const s = scale.get();
        tx.set(withDecay({ velocity: e.velocityX, clamp: [-maxX(s), maxX(s)] }));
        ty.set(withDecay({ velocity: e.velocityY, clamp: [-maxY(s), maxY(s)] }));
        return;
      }
      if (Math.abs(e.translationY) > DISMISS_DISTANCE || Math.abs(e.velocityY) > DISMISS_VELOCITY) {
        scheduleOnRN(onDismiss);
      } else {
        dismissY.set(withSpring(0, snap));
      }
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    maxDistance: 12,
    onDeactivate: (e) => {
      if (e.canceled) return;
      if (isZoomed.get()) {
        settle(1);
        return;
      }
      const s = DOUBLE_TAP_SCALE;
      const fx = e.x - width / 2;
      const fy = e.y - height / 2;
      scale.set(withSpring(s, snap));
      tx.set(withSpring(clamp(-fx * (s - 1), maxX(s)), snap));
      ty.set(withSpring(clamp(-fy * (s - 1), maxY(s)), snap));
      isZoomed.set(true);
      scheduleOnRN(reportZoom, true);
    },
  });

  const singleTap = useTapGesture({
    maxDistance: 8,
    onDeactivate: (e) => {
      if (!e.canceled && !isZoomed.get()) scheduleOnRN(onDismiss);
    },
  });

  const transforms = useSimultaneousGestures(pinch, pan);
  const taps = useExclusiveGestures(doubleTap, singleTap);
  // Pinch and pan win: a tap only counts if no pinch or drag happened, so
  // lifting two fingers after a pinch never reads as "tap to close".
  const gesture = useExclusiveGestures(transforms, taps);

  // Leaving this page resets it, like Photos.
  useEffect(() => {
    if (active) return;
    scale.set(1);
    tx.set(0);
    ty.set(0);
    // Paging is disabled while zoomed, so a page is never left zoomed.
    isZoomed.set(false);
  }, [active, scale, tx, ty, isZoomed]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() + dismissY.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height }} accessible accessibilityRole="image" accessibilityLabel={image.label}>
        {failed ? (
          <View style={styles.center}>
            <ImageOff size={iconSizes.xl} color={colors.ivory} strokeWidth={strokes.regular} />
            <AppText variant="callout" style={styles.errorText}>
              Couldn’t load this photo
            </AppText>
          </View>
        ) : (
          <Animated.View style={[styles.center, imageStyle]}>
            <Image
              source={uri ? { uri, cacheKey: image.cacheKey } : null}
              placeholder={image.thumbUri ? { uri: image.thumbUri, cacheKey: image.thumbCacheKey } : undefined}
              placeholderContentFit="contain"
              contentFit="contain"
              transition={150}
              cachePolicy="disk"
              style={{ width: fitW, height: fitH }}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
            {!loaded ? <ActivityIndicator color={colors.ivory} style={styles.spinner} /> : null}
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  errorText: { color: colors.ivory },
  // Small and out of the way: the thumbnail is already showing.
  spinner: { position: 'absolute', bottom: spacing.xl },
});
