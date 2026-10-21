import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BellRing, Heart, MessageCircle, UserPlus, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, BottomSheet } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { toUserMessage } from '@/lib/errors';
import { enablePush, getNotifications, getPushStatus, pushPath, refreshPushRegistration } from '@/lib/push';
import { usePushPromptStore } from '@/stores/pushPrompt';
import { toast } from '@/stores/toast';
import { colors, iconSizes, spacing, strokes } from '@/theme';

import { activityKey, unreadKey } from '../hooks';

const REASONS: { icon: LucideIcon; text: string }[] = [
  { icon: UserPlus, text: 'New followers and follow requests' },
  { icon: Heart, text: 'Likes on your creations and comments' },
  { icon: MessageCircle, text: 'Comments and replies to you' },
];

/**
 * Push plumbing for the signed-in app: keeps the device registered, opens the
 * right screen when a push is tapped, and shows our own explanation before
 * iOS ever asks for permission. Mount once.
 */
export function PushHost() {
  const me = useUserId();
  const qc = useQueryClient();
  const visible = usePushPromptStore((s) => s.visible);
  const close = usePushPromptStore((s) => s.close);
  const [busy, setBusy] = useState(false);
  // Only offer when iOS hasn't been asked yet; otherwise the sheet stays shut.
  const [askable, setAskable] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void getPushStatus().then((status) => {
      if (cancelled) return;
      if (status === 'undetermined') setAskable(true);
      else close();
    });
    return () => {
      cancelled = true;
    };
  }, [visible, close]);

  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications || !me) return;
    void refreshPushRegistration().catch(() => undefined);
    // While the app is open the in-app banner covers it; still list and badge.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
    const open = (data: unknown) => {
      void qc.invalidateQueries({ queryKey: activityKey });
      void qc.invalidateQueries({ queryKey: unreadKey });
      const path = pushPath(data);
      if (path) router.push(path);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      open(response.notification.request.content.data),
    );
    // Launched by tapping a push.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) open(response.notification.request.content.data);
    });
    return () => subscription.remove();
  }, [me, qc]);

  const enable = async () => {
    setBusy(true);
    try {
      const status = await enablePush();
      if (status === 'granted') toast.success('Notifications are on');
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t turn on notifications.'));
    } finally {
      setBusy(false);
      close();
    }
  };

  return (
    <BottomSheet visible={visible && askable} onClose={close} accessibilityLabel="Turn on notifications">
      <View style={styles.body}>
        <View style={styles.icon}>
          <BellRing size={iconSizes.lg} color={colors.ivory} strokeWidth={strokes.regular} />
        </View>
        <AppText variant="title2" align="center">
          Know when friends react
        </AppText>
        <AppText variant="callout" color="textSecondary" align="center">
          Cheffy only notifies you about people and creations you care about:
        </AppText>
        <View style={styles.reasons}>
          {REASONS.map(({ icon: Icon, text }) => (
            <View key={text} style={styles.reason}>
              <Icon size={iconSizes.md} color={colors.accent} strokeWidth={strokes.regular} />
              <AppText variant="callout">{text}</AppText>
            </View>
          ))}
        </View>
        <AppText variant="caption" color="textTertiary" align="center">
          You can choose which ones in Settings at any time.
        </AppText>
        <View style={styles.actions}>
          <AppButton label="Turn on notifications" fullWidth loading={busy} onPress={() => void enable()} />
          <AppButton label="Not now" variant="ghost" fullWidth onPress={close} />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  reasons: { alignSelf: 'stretch', gap: spacing.sm, paddingVertical: spacing.xs },
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.xs },
});
