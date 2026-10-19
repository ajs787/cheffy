import { Redirect } from 'expo-router';

import { homeHref } from '@/features/auth/gate';
import { useAuthStore } from '@/features/auth/store';
import { useMyProfile } from '@/features/profile/hooks';

/** "/" routes to the right place for the current auth state. */
export default function Index() {
  const signedIn = useAuthStore((s) => !!s.session);
  const recoveryMode = useAuthStore((s) => s.recoveryMode);
  const profile = useMyProfile();
  return <Redirect href={homeHref({ signedIn, recoveryMode, hasProfile: !!profile.data })} />;
}
