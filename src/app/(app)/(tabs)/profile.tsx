import { useUserId } from '@/features/auth/store';
import { ProfileView } from '@/features/profile/components/ProfileView';

export default function MyProfileScreen() {
  const me = useUserId();
  if (!me) return null;
  return <ProfileView userId={me} isOwn isTabRoot />;
}
