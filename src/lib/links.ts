import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { SUPPORT_EMAIL } from '@/constants/app';
import { toast } from '@/stores/toast';

/** Opens a web page in an in-app browser sheet (falls back to Safari). */
export async function openWebPage(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url).catch(() => toast.error('Couldn’t open the page.'));
  }
}

/** Starts an email to support; shows the address if no mail app is set up. */
export async function emailSupport(subject = 'Cheffy support'): Promise<void> {
  if (!SUPPORT_EMAIL) return;
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  try {
    await Linking.openURL(url);
  } catch {
    toast.show(`Email us at ${SUPPORT_EMAIL}`);
  }
}
