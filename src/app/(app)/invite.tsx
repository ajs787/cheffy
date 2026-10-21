import { router } from 'expo-router';
import { BookUser, Copy, Search, Send, Users } from 'lucide-react-native';
import { useDeferredValue, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UserRow } from '@/components/shared/UserRow';
import { AppButton, AppHeader, AppInput, AppText, Avatar, EmptyState, Monogram, RowSkeleton } from '@/components/ui';
import { contactsSupported } from '@/features/invite/deviceContacts';
import { useMyProfile } from '@/features/profile/hooks';
import { useSuggestedCooks, useUserSearch } from '@/features/social/hooks';
import { RedeemInviteCode } from '@/features/unlocks/components/RedeemInviteCode';
import { useInviteCode, useUnlocks } from '@/features/unlocks/hooks';
import { referralStatus } from '@/features/unlocks/rules';
import { copyText } from '@/lib/clipboard';
import { toUserMessage } from '@/lib/errors';
import { inviteMessage, shareInvite } from '@/lib/share';
import { toast } from '@/stores/toast';
import { colors, HAIRLINE, radii, SCREEN_GUTTER, spacing } from '@/theme';

/** Accounts this new can still credit the friend who invited them (server rule). */
const REDEEM_WINDOW_MS = 14 * 86_400_000;
const SUGGESTED_SHOWN = 5;

/**
 * Find friends: search people on Cheffy, follow suggestions, and invite the
 * rest. Invites go through the share sheet or a copied link; the optional
 * contacts picker runs on device and nothing from the address book is uploaded.
 */
export default function FindFriendsScreen() {
  const insets = useSafeAreaInsets();
  const { data: me } = useMyProfile();
  const code = useInviteCode();
  const unlocks = useUnlocks();
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());
  const search = useUserSearch(q);
  const suggested = useSuggestedCooks();
  const referrals = unlocks.data ? referralStatus(unlocks.data) : null;
  const [now] = useState(() => Date.now());
  const isNewAccount = me ? now - new Date(me.createdAt).getTime() < REDEEM_WINDOW_MS : false;

  const share = async () => {
    if (!me) return;
    try {
      await shareInvite(me, code.data);
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t open sharing.'));
    }
  };

  const copy = async () => {
    if (!me) return;
    try {
      if (await copyText(inviteMessage(me, { code: code.data }))) toast.success('Invite copied');
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t copy the invite.'));
    }
  };

  const people = q.length > 0 ? (search.data ?? []) : (suggested.data ?? []).slice(0, SUGGESTED_SHOWN);

  return (
    <View style={styles.screen}>
      <AppHeader title="Find friends" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        <View style={styles.gutter}>
          <AppInput
            icon={Search}
            // Uncontrolled: a controlled value can drop fast keystrokes while results re-render.
            onChangeText={setQuery}
            placeholder="Search by name or username"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search people on Cheffy"
          />
        </View>

        {/* People already on Cheffy */}
        <View>
          {q.length > 0 ? null : people.length > 0 ? (
            <AppText variant="overline" color="textSecondary" style={styles.label}>
              Suggested for you
            </AppText>
          ) : null}
          {q.length > 0 && search.isPending ? (
            <RowSkeleton count={3} />
          ) : q.length > 0 && people.length === 0 ? (
            <EmptyState
              icon={Users}
              compact
              title={`No one matches “${q}”`}
              message="Not on Cheffy yet? Send them an invite below."
            />
          ) : (
            people.map((user) => <UserRow key={user.id} user={user} />)
          )}
        </View>

        <View style={styles.rule} />

        {/* Invite */}
        <View style={styles.gutter}>
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Monogram size={36} />
              <AppText variant="overline" style={styles.ivory}>
                Une invitation
              </AppText>
            </View>
            <AppText variant="title1" style={styles.ivory}>
              Bring friends to the table
            </AppText>
            <AppText variant="body" style={styles.rose}>
              Invite 2 friends who join Cheffy to unlock an exclusive profile frame.
            </AppText>
            {referrals ? (
              <View
                style={styles.progress}
                accessible
                accessibilityLabel={`${Math.min(referrals.joined, referrals.goal)} of ${referrals.goal} friends joined. ${referrals.label}`}
              >
                <View style={styles.dots}>
                  {Array.from({ length: referrals.goal }, (_, i) => (
                    <View key={i} style={[styles.dot, i < referrals.joined && styles.dotOn]} />
                  ))}
                </View>
                <AppText variant="calloutStrong" style={styles.ivory}>
                  {Math.min(referrals.joined, referrals.goal)} of {referrals.goal} joined
                </AppText>
                <AppText variant="caption" style={styles.rose}>
                  · {referrals.label}
                </AppText>
              </View>
            ) : null}
            {me ? (
              <View style={styles.inviter}>
                <Avatar uri={me.avatarUrl} name={me.displayName} size="sm" />
                <AppText variant="calloutStrong" style={styles.ivory}>
                  @{me.username}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.gutter, styles.actions]}>
          <AppButton
            label="Share your invite"
            icon={Send}
            size="lg"
            fullWidth
            disabled={!me}
            onPress={() => void share()}
            accessibilityHint="Opens the share sheet: Messages, Instagram, WhatsApp and more"
          />
          <AppButton
            label="Copy invite link"
            icon={Copy}
            variant="secondary"
            fullWidth
            disabled={!me}
            onPress={() => void copy()}
          />
          {contactsSupported() ? (
            <AppButton
              label="Invite from contacts"
              icon={BookUser}
              variant="secondary"
              fullWidth
              disabled={!me}
              onPress={() => router.push('/invite-contacts')}
              accessibilityHint="Pick people from your contacts to text an invite. Contacts stay on your phone."
            />
          ) : null}
          <AppText variant="caption" color="textTertiary" align="center">
            Friends count once they create and verify a new account with your code. Sending an invite
            alone doesn’t count.
          </AppText>
        </View>

        {code.data ? (
          <View
            style={styles.code}
            accessible
            accessibilityLabel={`Your invite code: ${code.data.split('').join(' ')}`}
          >
            <AppText variant="overline" color="textSecondary">
              Your invite code
            </AppText>
            <AppText variant="title2" style={styles.codeText} selectable>
              {code.data}
            </AppText>
          </View>
        ) : null}

        {isNewAccount ? (
          <View style={styles.gutter}>
            <RedeemInviteCode />
          </View>
        ) : null}

        <AppText variant="caption" color="textTertiary" style={[styles.gutter, styles.note]}>
          Cheffy never uploads your address book or messages anyone for you. You choose who gets
          your invite.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.md, gap: spacing.lg },
  gutter: { paddingHorizontal: SCREEN_GUTTER },
  label: { paddingHorizontal: SCREEN_GUTTER, paddingBottom: spacing.xs },
  rule: { height: HAIRLINE, backgroundColor: colors.rule, marginHorizontal: SCREEN_GUTTER },
  card: { padding: spacing.xl, gap: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.oxblood },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  progress: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.ivory },
  dotOn: { backgroundColor: colors.ivory },
  inviter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  ivory: { color: colors.ivory },
  rose: { color: '#E3C4C9' },
  actions: { gap: spacing.md },
  code: { alignItems: 'center', gap: spacing.xs },
  codeText: { letterSpacing: 4, fontVariant: ['tabular-nums'] },
  note: { paddingTop: spacing.sm },
});
