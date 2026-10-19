import { homeHref } from './gate';

describe('homeHref', () => {
  it('routes by auth state', () => {
    expect(homeHref({ signedIn: false, hasProfile: false, recoveryMode: false })).toBe('/welcome');
    expect(homeHref({ signedIn: true, hasProfile: false, recoveryMode: false })).toBe('/onboarding');
    expect(homeHref({ signedIn: true, hasProfile: true, recoveryMode: false })).toBe('/home');
    expect(homeHref({ signedIn: true, hasProfile: true, recoveryMode: true })).toBe('/reset-password');
  });
});
