import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import * as SMS from 'expo-sms';
import { Platform, Share } from 'react-native';

import { toAccess, toInviteContacts, type ContactsAccess, type InviteContact } from './contacts';

/**
 * Native side of contact invites. Reads the address book on device only —
 * nothing here talks to Supabase or uploads contacts anywhere.
 */

const FIELDS = [ContactField.FULL_NAME, ContactField.PHONES, ContactField.EMAILS] as const;

export async function getContactsAccess(): Promise<ContactsAccess> {
  return toAccess(await getPermissionsAsync());
}

/** Shows the system prompt (iOS 18+ offers "Share all" or "Select contacts"). */
export async function requestContactsAccess(): Promise<ContactsAccess> {
  return toAccess(await requestPermissionsAsync());
}

export async function loadInviteContacts(): Promise<InviteContact[]> {
  // No sortOrder: in expo-contacts 58.0.8, ContactsSortOrder.UserDefault sends
  // 'userDefault' but iOS expects 'useDefault' and throws. We sort by name anyway.
  const raw = await Contact.getAllDetails(FIELDS);
  return toInviteContacts(raw);
}

/** iOS 18+ limited access: let the user pick more contacts to share with Cheffy. */
export function canChooseMoreContacts(): boolean {
  return Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 18;
}

export async function chooseMoreContacts(): Promise<void> {
  await Contact.presentAccessPicker();
}

export type InviteResult = 'sent' | 'cancelled' | 'unknown';

/**
 * Opens a prefilled text to the contact when the device can send SMS,
 * otherwise falls back to the share sheet (Mail, WhatsApp, Copy…).
 */
export async function inviteContact(contact: InviteContact, message: string): Promise<InviteResult> {
  if (contact.phone && (await SMS.isAvailableAsync())) {
    const { result } = await SMS.sendSMSAsync([contact.phone], message);
    return result;
  }
  const result = await Share.share({ message });
  return result.action === Share.sharedAction ? 'sent' : 'cancelled';
}
