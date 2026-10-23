import { AuthScaffold } from '@/components/shared/AuthScaffold';
import { AppText } from '@/components/ui';
import { signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/store';
import { ProfileForm } from '@/features/profile/components/ProfileForm';
import { useCreateProfile } from '@/features/profile/hooks';
import { suggestUsername } from '@/features/profile/schemas';
import { haptics } from '@/lib/haptics';

export default function OnboardingScreen() {
  const session = useSession();
  const createProfile = useCreateProfile();
  const email = session?.user.email ?? '';

  return (
    <AuthScaffold
      title="Set up your profile"
      subtitle="This is how friends will find you."
      showBack={false}
      footer={
        <AppText
          variant="calloutStrong"
          color="textSecondary"
          onPress={() => void signOut()}
          accessibilityRole="button"
        >
          Sign out
        </AppText>
      }
    >
      <ProfileForm
        initial={{ username: suggestUsername(email), displayName: '', bio: '', instagram: '' }}
        initialAvatarUrl={null}
        submitLabel="Start cooking"
        onSubmit={async (input) => {
          await createProfile.mutateAsync(input);
          haptics.success();
        }}
      />
    </AuthScaffold>
  );
}
