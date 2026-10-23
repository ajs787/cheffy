import { MAX_RECENTS, pushRecent } from './recentPeople';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const person = (id: string) => ({ id, username: `u${id}`, displayName: `U ${id}`, avatarUrl: null });

describe('pushRecent', () => {
  it('puts the latest first without duplicates', () => {
    const list = pushRecent(pushRecent(pushRecent([], person('1')), person('2')), person('1'));
    expect(list.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('keeps only basic profile fields and caps the list', () => {
    let list = [] as ReturnType<typeof pushRecent>;
    for (let i = 0; i < MAX_RECENTS + 5; i++)
      list = pushRecent(list, { ...person(String(i)), extra: 'x' } as never);
    expect(list).toHaveLength(MAX_RECENTS);
    expect(Object.keys(list[0]!).sort()).toEqual(['avatarUrl', 'displayName', 'id', 'username']);
  });
});
