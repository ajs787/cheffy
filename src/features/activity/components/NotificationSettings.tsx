import { useQuery } from '@tanstack/react-query';
import { Bell, Heart, MessageCircle, UserPlus } from 'lucide-react-native';
import { StyleSheet, Switch } from 'react-native';

import { SettingsGroup, SettingsRow } from '@/components/shared/SettingsRow';
import { AppText, Divider } from '@/components/ui';
import { getPushStatus, openSystemNotificationSettings, type PushStatus } from '@/lib/push';
import { usePushPromptStore } from '@/stores/pushPrompt';
import { colors, spacing } from '@/theme';

import {
  DEFAULT_PREFERENCES,
  usePushPreferences,
  useSavePushPreferences,
  type PushPreferences,
} from '../preferences';

const STATUS_LABEL: Record<PushStatus, string> = {
  granted: 'On',
  undetermined: 'Off',
  denied: 'Off in iOS Settings',
  unavailable: 'Needs app update',
};

const KINDS: { key: keyof PushPreferences; label: string; icon: typeof Bell }[] = [
  { key: 'follows', label: 'Follows & requests', icon: UserPlus },
  { key: 'likes', label: 'Likes', icon: Heart },
  { key: 'comments', label: 'Comments & replies', icon: MessageCircle },
];

/** Push on/off (via our explanation or iOS Settings) and which kinds to send. */
export function NotificationSettings() {
  const status = useQuery({ queryKey: ['push-status'], queryFn: getPushStatus, staleTime: 0 });
  const prefs = usePushPreferences();
  const save = useSavePushPreferences();
  const openPrompt = usePushPromptStore((s) => s.open);
  const current = prefs.data ?? DEFAULT_PREFERENCES;
  const value = status.data ?? 'undetermined';

  const onPress =
    value === 'undetermined' ? openPrompt : value === 'denied' ? openSystemNotificationSettings : undefined;

  return (
    <>
      <SettingsGroup title="Notifications">
        <SettingsRow icon={Bell} label="Push notifications" value={STATUS_LABEL[value]} onPress={onPress} />
        {KINDS.map(({ key, label, icon }) => (
          <SettingsRowWithDivider key={key}>
            <SettingsRow
              icon={icon}
              label={label}
              trailing={
                <Switch
                  value={current[key]}
                  onValueChange={(next) => save.mutate({ ...current, [key]: next })}
                  trackColor={{ true: colors.accent, false: colors.border }}
                  accessibilityLabel={`${label} notifications`}
                />
              }
            />
          </SettingsRowWithDivider>
        ))}
      </SettingsGroup>
      <AppText variant="caption" color="textSecondary" style={styles.note}>
        {value === 'unavailable'
          ? 'Push needs the latest version of Cheffy. Your activity inbox still shows everything.'
          : 'Choose what reaches your lock screen. Everything still appears in Activity.'}
      </AppText>
    </>
  );
}

function SettingsRowWithDivider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Divider inset={spacing.lg} />
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: spacing.xl, marginTop: -spacing.sm, marginBottom: spacing.sm },
});
