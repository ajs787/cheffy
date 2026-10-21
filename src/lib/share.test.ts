import { inviteMessage } from './share';


describe('inviteMessage', () => {
  const me = { id: 'u1', username: 'chefshin' };

  it('leads with the username and links the profile', () => {
    const message = inviteMessage(me, { downloadUrl: null });
    expect(message).toContain('@chefshin');
    expect(message).toContain('https://cheffy.me/user/u1');
    expect(message).not.toContain('Get the app');
  });

  it('includes the personal invite code and its link', () => {
    const message = inviteMessage(me, { downloadUrl: null, code: 'AB12CD34' });
    expect(message).toContain('code AB12CD34');
    expect(message).toContain('https://cheffy.me/invite/AB12CD34');
  });

  it('includes the download link when one is configured', () => {
    expect(inviteMessage(me, { downloadUrl: 'https://testflight.apple.com/join/abc' })).toContain(
      'Get the app: https://testflight.apple.com/join/abc',
    );
  });
});
