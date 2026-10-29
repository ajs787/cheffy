import * as Application from 'expo-application';
import { router } from 'expo-router';
import {
  Ban,
  Bookmark,
  FileText,
  Flame,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  NotebookPen,
  Palette,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPen,
  UserPlus,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsGroup, SettingsRow } from '@/components/shared/SettingsRow';
import { AppHeader, AppText, ConfirmationDialog, Divider } from '@/components/ui';
import { PRIVACY_URL, SUPPORT_EMAIL } from '@/constants/app';
import { NotificationSettings } from '@/features/activity/components/NotificationSettings';
import { signOut } from '@/features/auth/api';
import { DeleteAccountSheet } from '@/features/profile/components/DeleteAccountSheet';
import { useSession } from '@/features/auth/store';
import { useHasUnsavedEntry } from '@/features/posts/composeRecovery';
import {
  useMyProfile,
  useSetAccountPrivacy,
  useSetDiscoverable,
  useSetMostHatedOptIn,
} from '@/features/profile/hooks';
import { useIsModerator, useModerationQueue } from '@/features/moderation/hooks';
import { useFollowRequests } from '@/features/social/hooks';
import { toUserMessage } from '@/lib/errors';
import { emailSupport, openWebPage } from '@/lib/links';
import { toast } from '@/stores/toast';
import { colors, spacing } from '@/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const profile = useMyProfile();
  const setPrivacy = useSetAccountPrivacy();
  const setMostHated = useSetMostHatedOptIn();
  const setDiscoverable = useSetDiscoverable();
  const discoverable = profile.data?.discoverable ?? true;
  const allowMostHated = profile.data?.allowMostHated ?? true;
  const requests = useFollowRequests();
  const isModerator = useIsModerator().data === true;
  const openReports = useModerationQueue(isModerator).data?.length ?? 0;
  const isPrivate = profile.data?.isPrivate ?? false;
  const pending = requests.data?.length ?? 0;
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const unsavedEntry = useHasUnsavedEntry(confirmSignOut);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Sign out only once the sheet has fully closed (see DeleteAccountSheet).
  const [signOutConfirmed, setSignOutConfirmed] = useState(false);
  const signingOut = useRef(false);
  const runSignOut = () => {
    if (signingOut.current) return;
    signingOut.current = true;
    signOut().catch((error: unknown) => {
      signingOut.current = false;
      toast.error(toUserMessage(error));
    });
  };

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
          <Divider inset={spacing.lg} />
          <SettingsRow
            icon={UserPlus}
            label="Suggest my account to others"
            trailing={
              <Switch
                value={discoverable}
                disabled={!profile.data || setDiscoverable.isPending}
                onValueChange={(value) =>
                  setDiscoverable.mutate(value, {
                    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t change this setting.')),
                  })
                }
                trackColor={{ true: colors.accent, false: colors.border }}
                accessibilityLabel="Suggest my account to others"
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
            : 'Anyone can follow you and see your public creations. Turn this on to approve followers first.'}{' '}
          {discoverable
            ? 'You may appear in “Suggested for you”.'
            : 'You won’t appear in “Suggested for you”, but people can still search for you.'}
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
          <SettingsRow icon={Search} label="Find friends" onPress={() => router.push('/find-friends')} />
          <Divider inset={spacing.lg} />
          <SettingsRow icon={Send} label="Invite friends" onPress={() => router.push('/invite')} />
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

        {isModerator ? (
          <SettingsGroup title="Review">
            <SettingsRow
              icon={ShieldCheck}
              label="Moderation"
              value={openReports > 0 ? `${openReports} open` : 'All clear'}
              onPress={() => router.push('/moderation')}
            />
          </SettingsGroup>
        ) : null}

        <SettingsGroup title="About">
          <SettingsRow
            icon={FileText}
            label="Terms & Community Guidelines"
            onPress={() => router.push('/terms')}
          />
          <Divider inset={spacing.lg} />
          <SettingsRow icon={Shield} label="Privacy policy" onPress={() => void openWebPage(PRIVACY_URL)} />
          {SUPPORT_EMAIL ? (
            <>
              <Divider inset={spacing.lg} />
              <SettingsRow
                icon={LifeBuoy}
                label="Contact support"
                value={SUPPORT_EMAIL}
                onPress={() => void emailSupport()}
              />
            </>
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="Session">
          <SettingsRow icon={LogOut} label="Sign out" onPress={() => setConfirmSignOut(true)} />
          <Divider inset={spacing.lg} />
          <SettingsRow icon={Trash2} label="Delete account" destructive onPress={() => setDeleteOpen(true)} />
        </SettingsGroup>

        <AppText variant="caption" color="textTertiary" align="center">
          Cheffy {Application.nativeApplicationVersion ?? ''} ({Application.nativeBuildVersion ?? 'dev'})
        </AppText>
      </ScrollView>

      <ConfirmationDialog
        visible={confirmSignOut}
        title="Sign out?"
        message={
          unsavedEntry
            ? 'Your diary and drafts are saved to your account. An unsaved entry stays on this phone and comes back when you sign in again.'
            : 'Your diary and drafts are saved to your account. Sign back in anytime.'
        }
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setSignOutConfirmed(true);
          setConfirmSignOut(false);
          setTimeout(runSignOut, 1500); // fallback if the close report never comes
        }}
        onClosed={() => {
          if (signOutConfirmed) runSignOut();
        }}
      />
      <DeleteAccountSheet visible={deleteOpen} onDone={() => setDeleteOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: spacing.xl, marginTop: -spacing.sm, marginBottom: spacing.sm },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.xxl, paddingTop: spacing.md },
});
