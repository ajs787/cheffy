import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppHeader, ErrorState } from '@/components/ui';
import { ProfileForm } from '@/features/profile/components/ProfileForm';
import { useMyProfile, useUpdateProfile } from '@/features/profile/hooks';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

export default function EditProfileScreen() {
  const profile = useMyProfile();
  const update = useUpdateProfile();
  const p = profile.data;

  return (
    <View style={styles.screen}>
      <AppHeader title="Edit profile" leading="close" safeTop={Platform.OS !== 'ios'} bordered />
      {!p ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ProfileForm
              initial={{ username: p.username, displayName: p.displayName, bio: p.bio }}
              initialAvatarUrl={p.avatarUrl}
              currentUsername={p.username}
              submitLabel="Save"
              onSubmit={async (input) => {
                await update.mutateAsync(input);
                haptics.success();
                toast.success('Profile updated');
                router.back();
              }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: SCREEN_GUTTER, paddingBottom: spacing.huge },
});
