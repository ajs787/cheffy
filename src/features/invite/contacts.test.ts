import { filterContacts, reachLabel, toAccess, toInviteContacts } from './contacts';

describe('toAccess', () => {
  it('distinguishes full and limited access', () => {
    expect(toAccess({ granted: true, canAskAgain: true, accessPrivileges: 'all' })).toBe('all');
    expect(toAccess({ granted: true, canAskAgain: true, accessPrivileges: 'limited' })).toBe('limited');
    expect(toAccess({ granted: true, canAskAgain: true })).toBe('all');
  });

  it('knows when the prompt can no longer be shown', () => {
    expect(toAccess({ granted: false, canAskAgain: true })).toBe('undetermined');
    expect(toAccess({ granted: false, canAskAgain: false })).toBe('denied');
  });
});

describe('toInviteContacts', () => {
  it('keeps only name, first phone and whether there is an email, sorted by name', () => {
    const contacts = toInviteContacts([
      { id: '2', fullName: 'zoë park', phones: [{ number: ' ' }, { number: '+1 555 0100' }], emails: [] },
      { id: '1', fullName: 'Ada Lovelace', phones: [], emails: [{ address: 'ada@example.com' }] },
    ]);
    expect(contacts).toEqual([
      { id: '1', name: 'Ada Lovelace', phone: null, hasEmail: true },
      { id: '2', name: 'zoë park', phone: '+1 555 0100', hasEmail: false },
    ]);
    expect(JSON.stringify(contacts)).not.toContain('ada@example.com');
  });

  it('drops contacts with no way to reach them and names unnamed ones by number', () => {
    const contacts = toInviteContacts([
      { id: '1', fullName: 'No Details', phones: null, emails: null },
      { id: '2', fullName: null, phones: [{ number: '555 0101' }] },
    ]);
    expect(contacts).toEqual([{ id: '2', name: '555 0101', phone: '555 0101', hasEmail: false }]);
  });
});

describe('filterContacts and reachLabel', () => {
  const contacts = toInviteContacts([
    { id: '1', fullName: 'Ada Lovelace', emails: [{ address: 'a@example.com' }], phones: [{ number: '1' }] },
    { id: '2', fullName: 'Grace Hopper', phones: [{ number: '2' }] },
  ]);

  it('matches names case-insensitively', () => {
    expect(filterContacts(contacts, '  grace ').map((c) => c.id)).toEqual(['2']);
    expect(filterContacts(contacts, '')).toHaveLength(2);
  });

  it('describes how a contact can be reached', () => {
    expect(reachLabel(contacts[0])).toBe('Phone · Email');
    expect(reachLabel(contacts[1])).toBe('Phone');
  });
});
