import { router } from 'expo-router';
import { BookUser, Search, Send } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppHeader, AppText, Avatar, Monogram } from '@/components/ui';
import { APP_DOWNLOAD_URL } from '@/constants/app';
import { useMyProfile } from '@/features/profile/hooks';
import { toUserMessage } from '@/lib/errors';
import { shareInvite } from '@/lib/share';
import { contactsSupported } from '@/features/invite/deviceContacts';
import { RedeemInviteCode } from '@/features/unlocks/components/RedeemInviteCode';
import { useInviteCode } from '@/features/unlocks/hooks';
import { toast } from '@/stores/toast';
import { colors, HAIRLINE, radii, SCREEN_GUTTER, spacing } from '@/theme';

/**
 * Invite friends through the system share sheet — Messages, Instagram DMs,
 * WhatsApp, Mail, Copy. No contact upload and no Instagram friend scraping:
 * the person chooses exactly who gets the invite. "Find from contacts" is an
 * optional on-device picker; it asks for Contacts access only once tapped.
 */
export default function InviteScreen() {
  const insets = useSafeAreaInsets();
  const { data: me } = useMyProfile();
  const code = useInviteCode();

  const share = async () => {
    if (!me) return;
    try {
      await shareInvite(me, code.data);
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t open sharing.'));
    }
  };

  return (
    <View style={styles.screen}>
      <AppHeader title="Invite friends" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Monogram size={36} />
            <AppText variant="overline" style={styles.ivory}>
              Une invitation
            </AppText>
          </View>
          <AppText variant="title1" style={styles.ivory}>
            Cook with friends
          </AppText>
          <AppText variant="body" style={styles.rose}>
            Cheffy is better with people you’d actually share a meal with. Send them your invite.
          </AppText>
          {me ? (
            <View style={styles.inviter}>
              <Avatar uri={me.avatarUrl} name={me.displayName} size="sm" />
              <AppText variant="calloutStrong" style={styles.ivory}>
                @{me.username}
              </AppText>
            </View>
          ) : null}
        </View>

        <AppButton
          label="Share your invite"
          icon={Send}
          size="lg"
          fullWidth
          disabled={!me}
          onPress={() => void share()}
          accessibilityHint="Opens the share sheet: Messages, Instagram, WhatsApp and more"
        />
        <AppText variant="caption" color="textSecondary" align="center">
          Choose Messages, Instagram, WhatsApp, Mail — or copy it.
        </AppText>

        {contactsSupported() ? (
          <AppButton
            label="Find from contacts"
            icon={BookUser}
            variant="secondary"
            fullWidth
            disabled={!me}
            onPress={() => router.push('/invite-contacts')}
            accessibilityHint="Pick people from your contacts to text an invite. Contacts stay on your phone."
          />
        ) : null}

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
            <AppText variant="caption" color="textTertiary" align="center">
              Friends who join with it count toward the Host’s frame.
            </AppText>
          </View>
        ) : null}

        <View style={styles.divider} />

        <AppButton
          label="Find people already on Cheffy"
          icon={Search}
          variant="secondary"
          fullWidth
          onPress={() => router.push({ pathname: '/search', params: { tab: 'people' } })}
        />

        <AppText variant="caption" color="textTertiary" style={styles.note}>
          {APP_DOWNLOAD_URL
            ? 'Your invite includes a link to get the app and a link to your profile.'
            : 'Your invite includes your username and a link that opens your profile once a friend has Cheffy installed.'}
        </AppText>
        <RedeemInviteCode />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.md, gap: spacing.md },
  card: {
    padding: spacing.xl,
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.oxblood,
    marginBottom: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  inviter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  ivory: { color: colors.ivory },
  rose: { color: '#E3C4C9' },
  divider: { height: HAIRLINE, backgroundColor: colors.rule, marginVertical: spacing.sm },
  note: { paddingTop: spacing.sm },
  code: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  codeText: { letterSpacing: 4, fontVariant: ['tabular-nums'] },
});
