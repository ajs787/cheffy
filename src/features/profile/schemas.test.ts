import { profileSchema, suggestUsername, usernameSchema } from './schemas';

describe('profile schemas', () => {
  it.each(['audrey', 'chef.audrey', 'a_b_c', 'mix3d'])('accepts %s', (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(true);
  });

  it.each(['ab', 'has space', '.lead', 'trail.', 'dou..ble', 'emoji😀', 'x'.repeat(25)])('rejects %s', (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(false);
  });

  it('lowercases usernames', () => {
    expect(usernameSchema.parse('Audrey')).toBe('audrey');
  });

  it('validates the whole profile', () => {
    expect(profileSchema.safeParse({ username: 'audrey', displayName: ' ', bio: '' }).success).toBe(false);
    expect(profileSchema.safeParse({ username: 'audrey', displayName: 'Audrey', bio: 'x'.repeat(161) }).success).toBe(
      false,
    );
  });

  it('suggests usernames from emails', () => {
    expect(suggestUsername('Audrey.Shin+test@gmail.com')).toBe('audrey.shin');
    expect(suggestUsername('ab@x.com')).toBe('');
    expect(suggestUsername('..weird..name..@x.com')).toBe('weird.name');
  });
});
