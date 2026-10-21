import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Avatar, FoodImage, PressableScale } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useNotificationBannerStore } from '@/stores/notificationBanner';
import { colors, HAIRLINE, radii, shadows, spacing } from '@/theme';

import { activityTarget, describe } from '../api';
import { useNotificationsRealtime } from '../useNotificationsRealtime';

const DURATION_MS = 4500;

/** Screens where a banner would interrupt: creating/editing, or the inbox itself. */
export function bannerSuppressedOn(pathname: string): boolean {
  return ['/compose', '/edit-profile', '/collection/edit', '/activity'].some((p) => pathname.startsWith(p));
}

/**
 * A small banner for new activity while the app is open. Mount once inside
 * the signed-in area; it also owns the Realtime subscription.
 */
export function NotificationBannerHost() {
  useNotificationsRealtime();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const current = useNotificationBannerStore((s) => s.current);
  const dismiss = useNotificationBannerStore((s) => s.dismiss);
  const suppressed = bannerSuppressedOn(pathname);

  useEffect(() => {
    if (!current) return;
    if (suppressed) {
      dismiss(current.id);
      return;
    }
    haptics.light();
    AccessibilityInfo.announceForAccessibility(`${current.actor.username} ${describe(current)}`);
    const timer = setTimeout(() => dismiss(current.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [current, suppressed, dismiss]);

  if (!current || suppressed) return null;

  return (
    <Animated.View
      key={current.id}
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
    >
      <PressableScale
        onPress={() => {
          dismiss(current.id);
          router.push(activityTarget(current));
        }}
        activeScale={0.98}
        accessibilityRole="button"
        accessibilityLabel={`${current.actor.username} ${describe(current)}. Opens it.`}
        style={styles.banner}
      >
        <Avatar uri={current.actor.avatarUrl} name={current.actor.displayName} size="sm" />
        <View style={styles.text}>
          <AppText variant="callout" numberOfLines={2}>
            <AppText variant="calloutStrong">{current.actor.username}</AppText> {describe(current)}
          </AppText>
          {current.commentBody && current.type !== 'comment_like' ? (
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              “{current.commentBody}”
            </AppText>
          ) : null}
        </View>
        {current.post?.thumbPath ? (
          <FoodImage
            uri={current.post.thumbUrl}
            cacheKey={current.post.thumbPath}
            style={styles.thumb}
            radius="sm"
          />
        ) : null}
      </PressableScale>
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
