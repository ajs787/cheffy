import * as Application from 'expo-application';
import { router } from 'expo-router';
import { Ban, Bookmark, FileText, LogOut, Mail, NotebookPen, Trash2, UserPen } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsGroup, SettingsRow } from '@/components/shared/SettingsRow';
import { AppHeader, AppText, ConfirmationDialog, Divider } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/constants/app';
import { signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/store';
import { useDeleteAccount } from '@/features/profile/hooks';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { colors, spacing } from '@/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const deleteAccount = useDeleteAccount();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);

  return (
    <View style={styles.screen}>
      <AppHeader title="Settings" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <SettingsGroup title="Account">
          <SettingsRow icon={UserPen} label="Edit profile" onPress={() => router.push('/edit-profile')} />
          <Divider inset={spacing.lg} />
          <SettingsRow icon={NotebookPen} label="Drafts" onPress={() => router.push('/drafts')} />
          <Divider inset={spacing.lg} />
          <SettingsRow icon={Bookmark} label="Want to make" onPress={() => router.push('/saved')} />
          <Divider inset={spacing.lg} />
          <SettingsRow icon={Ban} label="Blocked accounts" onPress={() => router.push('/blocked')} />
          <Divider inset={spacing.lg} />
          <SettingsRow icon={Mail} label="Email" value={session?.user.email ?? ''} />
        </SettingsGroup>

        <SettingsGroup title="About">
          <SettingsRow icon={FileText} label="Terms & Community Guidelines" onPress={() => router.push('/terms')} />
          {SUPPORT_EMAIL ? (
            <>
              <Divider inset={spacing.lg} />
              <SettingsRow icon={Mail} label="Contact support" value={SUPPORT_EMAIL} />
            </>
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="Session">
          <SettingsRow icon={LogOut} label="Sign out" onPress={() => setConfirmSignOut(true)} />
          <Divider inset={spacing.lg} />
          <SettingsRow icon={Trash2} label="Delete account" destructive onPress={() => setDeleteStep(1)} />
        </SettingsGroup>

        <AppText variant="caption" color="textTertiary" align="center">
          Cheffy {Application.nativeApplicationVersion ?? ''} ({Application.nativeBuildVersion ?? 'dev'})
        </AppText>
      </ScrollView>

      <ConfirmationDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="Your diary is saved to your account. Sign back in anytime."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={async () => {
          try {
            await signOut();
          } catch (error) {
            toast.error(toUserMessage(error));
          }
          setConfirmSignOut(false);
        }}
      />
      <ConfirmationDialog
        visible={deleteStep === 1}
        title="Delete your account?"
        message="This permanently deletes your profile, every post and photo, your rankings, collections, comments and likes. It can’t be undone."
        confirmLabel="Continue"
        destructive
        onCancel={() => setDeleteStep(0)}
        onConfirm={() => setDeleteStep(2)}
      />
      <ConfirmationDialog
        visible={deleteStep === 2}
        title="Are you absolutely sure?"
        message="Everything you’ve logged on Cheffy will be gone for good."
        confirmLabel="Delete my account"
        destructive
        onCancel={() => setDeleteStep(0)}
        onConfirm={async () => {
          try {
            await deleteAccount.mutateAsync();
            toast.show('Your account was deleted.');
          } catch (error) {
            toast.error(toUserMessage(error, 'Couldn’t delete your account. Please try again.'));
          }
          setDeleteStep(0);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.xxl, paddingTop: spacing.md },
});
