import { inviteMessage } from './share';

// Hoisted above the import by Jest.
jest.mock('expo-linking', () => ({ createURL: (path: string) => `cheffy://${path}` }));

describe('inviteMessage', () => {
  const me = { id: 'u1', username: 'chefshin' };

  it('leads with the username and links the profile', () => {
    const message = inviteMessage(me, { downloadUrl: null });
    expect(message).toContain('@chefshin');
    expect(message).toContain('cheffy://user/u1');
    expect(message).not.toContain('Get the app');
  });

  it('includes the personal invite code and its link', () => {
    const message = inviteMessage(me, { downloadUrl: null, code: 'AB12CD34' });
    expect(message).toContain('invite code AB12CD34');
    expect(message).toContain('cheffy://invite/AB12CD34');
  });

  it('includes the download link when one is configured', () => {
    expect(inviteMessage(me, { downloadUrl: 'https://testflight.apple.com/join/abc' })).toContain(
      'Get the app: https://testflight.apple.com/join/abc',
    );
  });
});
