import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';

type NotificationsModule = typeof import('expo-notifications');

let loaded: NotificationsModule | null | undefined;

/**
 * expo-notifications, or null in builds without its native code (older
 * TestFlight builds, Expo Go). Importing it there would crash at startup, so
 * it's only required once the native module is known to exist.
 */
export function getNotifications(): NotificationsModule | null {
  if (loaded !== undefined) return loaded;
  loaded = requireOptionalNativeModule('ExpoPushTokenManager')
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
      (require('expo-notifications') as NotificationsModule)
    : null;
  return loaded;
}

export type PushStatus = 'unavailable' | 'undetermined' | 'denied' | 'granted';

export async function getPushStatus(): Promise<PushStatus> {
  const Notifications = getNotifications();
  if (!Notifications) return 'unavailable';
  const settings = await Notifications.getPermissionsAsync();
  if (Platform.OS === 'ios') {
    const ios = settings.ios?.status;
    if (ios === Notifications.IosAuthorizationStatus.NOT_DETERMINED) return 'undetermined';
    if (ios === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
    return 'granted';
  }
  return settings.granted ? 'granted' : settings.canAskAgain ? 'undetermined' : 'denied';
}

const projectId = () =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
  Constants.easConfig?.projectId;

/** Gets this device's Expo push token and registers it for the signed-in user. */
async function registerToken(Notifications: NotificationsModule): Promise<string | null> {
  const id = projectId();
  if (!id) return null;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  unwrap(await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS }));
  return token;
}

/**
 * Asks iOS for permission (only ever after the person taps Enable on our own
 * explanation) and registers the device. Returns the resulting status.
 */
export async function enablePush(): Promise<PushStatus> {
  const Notifications = getNotifications();
  if (!Notifications) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Activity',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  const status = await getPushStatus();
  if (status === 'granted') await registerToken(Notifications);
  return status;
}

/** On launch: keep the token fresh if permission was already granted. Never prompts. */
export async function refreshPushRegistration(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications || (await getPushStatus()) !== 'granted') return;
  await registerToken(Notifications);
}

/** On sign-out: stop sending this person's notifications to this phone. */
export async function unregisterPush(): Promise<void> {
  const Notifications = getNotifications();
  const id = projectId();
  if (!Notifications || !id || (await getPushStatus()) !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await supabase.from('push_tokens').delete().eq('token', token);
}

/** Denied permissions can only be changed in iOS Settings. */
export const openSystemNotificationSettings = () => void Linking.openSettings();

/** The in-app path a push carries (e.g. "/post/123"), validated. */
export function pushPath(data: unknown): `/post/${string}` | `/user/${string}` | null {
  const path = (data as { path?: unknown } | null)?.path;
  if (typeof path !== 'string') return null;
  return /^\/(post|user)\/[0-9a-f-]{36}$/.test(path) ? (path as `/post/${string}` | `/user/${string}`) : null;
}
