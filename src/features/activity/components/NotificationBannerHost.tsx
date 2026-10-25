import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText, Avatar, FoodImage, PressableScale } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useNotificationBannerStore } from '@/stores/notificationBanner';
import { colors, HAIRLINE, radii, shadows, spacing, springs } from '@/theme';

import { activityTarget, describe, type ActivityItem } from '../api';
import { useNotificationsRealtime } from '../useNotificationsRealtime';

const DURATION_MS = 4500;
/** VoiceOver/TalkBack users need time to hear it and act on it. */
const SCREEN_READER_DURATION_MS = 10_000;
/** Gap between queued banners, so one leaves before the next arrives. */
const BETWEEN_MS = 280;
/** A short flick up, or a drag past this, dismisses. */
const DISMISS_DISTANCE = 32;
const DISMISS_VELOCITY = -500;

/** Screens where a banner would interrupt: creating/editing, or the inbox itself. */
export function bannerSuppressedOn(pathname: string): boolean {
  return ['/compose', '/edit-profile', '/collection/edit', '/activity'].some((p) => pathname.startsWith(p));
}

/**
 * Small banners for new activity while the app is open, one at a time. Tap to
 * open it; swipe up to hide it. Hiding a banner never changes the
 * notification itself, which stays in Activity as unread. Mount once inside
 * the signed-in area; it also owns the Realtime subscription.
 */
export function NotificationBannerHost() {
  useNotificationsRealtime();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const current = useNotificationBannerStore((s) => s.current);
  const waiting = useNotificationBannerStore((s) => s.queue.length);
  const dismiss = useNotificationBannerStore((s) => s.dismiss);
  const advance = useNotificationBannerStore((s) => s.advance);
  const [screenReader, setScreenReader] = useState(false);
  // While a finger is on the banner it stays up.
  const [holding, setHolding] = useState(false);
  const suppressed = bannerSuppressedOn(pathname);

  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!current) return;
    if (suppressed) {
      dismiss(current.id);
      return;
    }
    haptics.light();
    AccessibilityInfo.announceForAccessibility(`${current.actor.username} ${describe(current)}`);
  }, [current, suppressed, dismiss]);

  useEffect(() => {
    if (!current || suppressed || holding) return;
    const timer = setTimeout(
      () => dismiss(current.id),
      screenReader ? SCREEN_READER_DURATION_MS : DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [current, suppressed, holding, screenReader, dismiss]);

  // Next in line, once the last banner has animated out.
  useEffect(() => {
    if (current || waiting === 0) return;
    const timer = setTimeout(advance, BETWEEN_MS);
    return () => clearTimeout(timer);
  }, [current, waiting, advance]);

  if (!current || suppressed) return null;

  return (
    <Banner
      key={current.id}
      item={current}
      top={insets.top + spacing.sm}
      onHold={setHolding}
      onDismiss={() => {
        setHolding(false);
        dismiss(current.id);
      }}
    />
  );
}

function Banner({
  item,
  top,
  onHold,
  onDismiss,
}: {
  item: ActivityItem;
  top: number;
  onHold: (holding: boolean) => void;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(0);

  const pan = usePanGesture({
    // Vertical drags only; a sideways scroll underneath isn't hijacked.
    activeOffsetY: [-8, 8],
    failOffsetX: [-24, 24],
    onBegin: () => {
      scheduleOnRN(onHold, true);
    },
    onUpdate: (event) => {
      // Follows the finger up; resists being pulled down.
      translateY.set(event.translationY < 0 ? event.translationY : event.translationY * 0.2);
    },
    onDeactivate: (event) => {
      if (event.translationY < -DISMISS_DISTANCE || event.velocityY < DISMISS_VELOCITY) {
        translateY.set(
          withTiming(-(top + 140), { duration: reduceMotion ? 0 : 180 }, (finished) => {
            if (finished) scheduleOnRN(onDismiss);
          }),
        );
      } else {
        translateY.set(withSpring(0, springs.sheet));
      }
    },
    onFinalize: () => {
      scheduleOnRN(onHold, false);
    },
  });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: 1 + Math.min(0, translateY.value) / 160,
  }));

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(220)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
      style={[styles.wrap, { top }]}
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={dragStyle}>
          {/* A swipe cancels this press, so swiping never opens it. */}
          <PressableScale
            onPress={() => {
              onDismiss();
              router.push(activityTarget(item));
            }}
            activeScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={`${item.actor.username} ${describe(item)}`}
            accessibilityHint="Opens it. Swipe up to dismiss."
            accessibilityActions={[{ name: 'dismiss', label: 'Dismiss' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'dismiss') onDismiss();
            }}
            onAccessibilityEscape={onDismiss}
            style={styles.banner}
          >
            <Avatar uri={item.actor.avatarUrl} name={item.actor.displayName} size="sm" />
            <View style={styles.text}>
              <AppText variant="callout" numberOfLines={2}>
                <AppText variant="calloutStrong">{item.actor.username}</AppText> {describe(item)}
              </AppText>
              {item.commentBody && item.type !== 'comment_like' ? (
                <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                  “{item.commentBody}”
                </AppText>
              ) : null}
            </View>
            {item.post?.thumbPath ? (
              <FoodImage
                uri={item.post.thumbUrl}
                cacheKey={item.post.thumbPath}
                style={styles.thumb}
                radius="sm"
              />
            ) : null}
          </PressableScale>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 900 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.rule,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  text: { flex: 1, gap: 2 },
  thumb: { width: 40, height: 40 },
});
