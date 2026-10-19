import type { Href } from 'expo-router';

/** Where "/" should land for the current auth state. */
export function homeHref(state: { signedIn: boolean; hasProfile: boolean; recoveryMode: boolean }): Href {
  if (!state.signedIn) return '/welcome';
  if (state.recoveryMode) return '/reset-password';
  if (!state.hasProfile) return '/onboarding';
  return '/home';
}
