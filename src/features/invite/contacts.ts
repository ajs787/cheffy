/**
 * Pure helpers for inviting from the address book. No native imports, so they
 * run in tests. Contacts never leave the device: we keep only what the list
 * and the SMS composer need, in memory, for as long as the screen is open.
 */

/** The minimum we keep about a contact. */
export interface InviteContact {
  id: string;
  name: string;
  /** First phone number — used only to address the SMS the user sends. */
  phone: string | null;
  hasEmail: boolean;
}

/** The subset of expo-contacts details we read. */
export interface RawContactDetails {
  id: string;
  fullName?: string | null;
  phones?: { number?: string | null }[] | null;
  emails?: { address?: string | null }[] | null;
}

export type ContactsAccess = 'all' | 'limited' | 'denied' | 'undetermined';

export function toAccess(permission: {
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges?: 'all' | 'limited' | 'none';
}): ContactsAccess {
  if (permission.granted) return permission.accessPrivileges === 'limited' ? 'limited' : 'all';
  return permission.canAskAgain ? 'undetermined' : 'denied';
}

export function toInviteContacts(raw: readonly RawContactDetails[]): InviteContact[] {
  const contacts: InviteContact[] = [];
  for (const item of raw) {
    const phone = item.phones?.find((p) => p.number?.trim())?.number?.trim() ?? null;
    const hasEmail = Boolean(item.emails?.some((e) => e.address?.trim()));
    // Someone you can't reach isn't someone you can invite.
    if (!phone && !hasEmail) continue;
    const name = item.fullName?.trim() || phone || 'Unnamed contact';
    contacts.push({ id: item.id, name, phone, hasEmail });
  }
  return contacts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function filterContacts(contacts: readonly InviteContact[], query: string): InviteContact[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...contacts];
  return contacts.filter((c) => c.name.toLocaleLowerCase().includes(q));
}

/** "Phone · Email", "Phone", or "Email" — what the row says you can reach them by. */
export function reachLabel(contact: InviteContact): string {
  return [contact.phone ? 'Phone' : null, contact.hasEmail ? 'Email' : null].filter(Boolean).join(' · ');
}
