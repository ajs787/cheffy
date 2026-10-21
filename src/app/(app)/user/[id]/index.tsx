import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '@/features/auth/store';
import { ProfileView } from '@/features/profile/components/ProfileView';

export default function UserProfileScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const me = useUserId();
  return (
    <ProfileView userId={id} isOwn={id === me} initialTab={tab === 'rankings' ? 'rankings' : undefined} />
  );
}
