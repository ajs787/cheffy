import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '@/features/auth/store';
import { ProfileView } from '@/features/profile/components/ProfileView';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUserId();
  return <ProfileView userId={id} isOwn={id === me} />;
}
