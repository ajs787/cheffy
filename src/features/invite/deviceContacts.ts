import { requireOptionalNativeModule } from 'expo';
import { Platform, Share } from 'react-native';

import { toAccess, toInviteContacts, type ContactsAccess, type InviteContact } from './contacts';

/**
 * Native side of contact invites. Reads the address book on device only —
 * nothing here talks to Supabase or uploads contacts anywhere.
 */

type ContactsModule = typeof import('expo-contacts');
type SmsModule = typeof import('expo-sms');

let contactsModule: ContactsModule | null | undefined;
let smsModule: SmsModule | null | undefined;

/**
 * expo-contacts / expo-sms, or null in builds that don't include their
 * native code (older TestFlight builds, Expo Go). Importing them there
 * throws at load time, so they're only required once the native module is
 * known to exist.
 */
function getContacts(): ContactsModule | null {
  if (contactsModule === undefined) {
    contactsModule = requireOptionalNativeModule('ExpoContactsNext')
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
        (require('expo-contacts') as ContactsModule)
      : null;
  }
  return contactsModule;
}

function getSms(): SmsModule | null {
  if (smsModule === undefined) {
    smsModule = requireOptionalNativeModule('ExpoSMS')
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
        (require('expo-sms') as SmsModule)
      : null;
  }
  return smsModule;
}

/** False when this build can't read contacts (needs the latest app build). */
export function contactsSupported(): boolean {
  return getContacts() !== null;
}

function requireContacts(): ContactsModule {
  const contacts = getContacts();
  if (!contacts) throw new Error('Contacts need the latest version of Cheffy.');
  return contacts;
}

export async function getContactsAccess(): Promise<ContactsAccess> {
  return toAccess(await requireContacts().getPermissionsAsync());
}

/** Shows the system prompt (iOS 18+ offers "Share all" or "Select contacts"). */
export async function requestContactsAccess(): Promise<ContactsAccess> {
  return toAccess(await requireContacts().requestPermissionsAsync());
}

export async function loadInviteContacts(): Promise<InviteContact[]> {
  // No sortOrder: in expo-contacts 58.0.8, ContactsSortOrder.UserDefault sends
  // 'userDefault' but iOS expects 'useDefault' and throws. We sort by name anyway.
  const { Contact, ContactField } = requireContacts();
  const raw = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES, ContactField.EMAILS]);
  return toInviteContacts(raw);
}

/** iOS 18+ limited access: let the user pick more contacts to share with Cheffy. */
export function canChooseMoreContacts(): boolean {
  return Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 18;
}

export async function chooseMoreContacts(): Promise<void> {
  await requireContacts().Contact.presentAccessPicker();
}

export type InviteResult = 'sent' | 'cancelled' | 'unknown';

/**
 * Opens a prefilled text to the contact when the device can send SMS,
 * otherwise falls back to the share sheet (Mail, WhatsApp, Copy…).
 */
export async function inviteContact(contact: InviteContact, message: string): Promise<InviteResult> {
  const SMS = getSms();
  if (contact.phone && SMS && (await SMS.isAvailableAsync())) {
    const { result } = await SMS.sendSMSAsync([contact.phone], message);
    return result;
  }
  const result = await Share.share({ message });
  return result.action === Share.sharedAction ? 'sent' : 'cancelled';
}
