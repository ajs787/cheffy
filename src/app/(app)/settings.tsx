import * as Application from 'expo-application';
import { router } from 'expo-router';
import {
  Ban,
  Bookmark,
  FileText,
  Flame,
  Lock,
  LogOut,
  Mail,
  NotebookPen,
  Palette,
  Send,
  Trash2,
  UserCheck,
  UserPen,
} from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsGroup, SettingsRow } from '@/components/shared/SettingsRow';
import { AppHeader, AppText, ConfirmationDialog, Divider } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/constants/app';
import { NotificationSettings } from '@/features/activity/components/NotificationSettings';
import { signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/store';
import {
  useDeleteAccount,
  useMyProfile,
  useSetAccountPrivacy,
  useSetMostHatedOptIn,
} from '@/features/profile/hooks';
import { useFollowRequests } from '@/features/social/hooks';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { colors, spacing } from '@/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const deleteAccount = useDeleteAccount();
  const profile = useMyProfile();
  const setPrivacy = useSetAccountPrivacy();
  const setMostHated = useSetMostHatedOptIn();
  const allowMostHated = profile.data?.allowMostHated ?? true;
  const requests = useFollowRequests();
  const isPrivate = profile.data?.isPrivate ?? false;
  const pending = requests.data?.length ?? 0;
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);

  return (
    <View style={styles.screen}>
      <AppHeader title="Settings" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <SettingsGroup title="Privacy">
          <SettingsRow
            icon={Lock}
            label="Private account"
            trailing={
              <Switch
                value={isPrivate}
                disabled={!profile.data || setPrivacy.isPending}
                onValueChange={(value) =>
                  setPrivacy.mutate(value, {
                    onSuccess: () =>
                      toast.success(value ? 'Your account is private' : 'Your account is public'),
                    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t change your privacy.')),
                  })
                }
                trackColor={{ true: colors.accent, false: colors.border }}
                accessibilityLabel="Private account"
              />
            }
          />
          {isPrivate || pending > 0 ? (
            <>
              <Divider inset={spacing.lg} />
              <SettingsRow
                icon={UserCheck}
                label="Follow requests"
                value={pending > 0 ? String(pending) : undefined}
                onPress={() => router.push('/follow-requests')}
              />
            </>
          ) : null}
        </SettingsGroup>
        <AppText variant="caption" color="textSecondary" style={styles.note}>
          {isPrivate
            ? 'Only people you approve can see your creations, rankings and collections. Anyone can still find your name and photo.'
            : 'Anyone can follow you and see your public creations. Turn this on to approve followers first.'}
        </AppText>

        <SettingsGroup title="Discover">
          <SettingsRow
            icon={Flame}
            label="Feature me in Most Hated"
            trailing={
              <Switch
                value={allowMostHated}
                disabled={!profile.data || setMostHated.isPending}
                onValueChange={(value) =>
                  setMostHated.mutate(value, {
                    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t change this setting.')),
                  })
                }
                trackColor={{ true: colors.accent, false: colors.border }}
                accessibilityLabel="Feature me in Most Hated"
              />
            }
          />
        </SettingsGroup>
        <AppText variant="caption" color="textSecondary" style={styles.note}>
          Your lowest-rated public creations of the week can appear in Discover’s Most Hated. Only your own
          ratings count, and nobody gets notified.
        </AppText>

        <NotificationSettings />

        <SettingsGroup title="Account">
          <SettingsRow icon={Send} label="Find friends" onPress={() => router.push('/invite')} />
          <Divider inset={spacing.lg} />
          <SettingsRow
            icon={Palette}
            label="Personalize profile"
            onPress={() => router.push('/personalize')}
          />
          <Divider inset={spacing.lg} />
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
          <SettingsRow
            icon={FileText}
            label="Terms & Community Guidelines"
            onPress={() => router.push('/terms')}
          />
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
  note: { paddingHorizontal: spacing.xl, marginTop: -spacing.sm, marginBottom: spacing.sm },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.xxl, paddingTop: spacing.md },
});
