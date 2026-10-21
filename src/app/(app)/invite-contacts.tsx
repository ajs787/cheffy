import { FlashList } from '@shopify/flash-list';
import { BookUser, Lock, MessageCircle, Search, Send, Smartphone, UserPlus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppHeader, AppInput, AppText, Avatar, EmptyState, RowSkeleton } from '@/components/ui';
import { filterContacts, reachLabel, type ContactsAccess, type InviteContact } from '@/features/invite/contacts';
import {
  canChooseMoreContacts,
  chooseMoreContacts,
  getContactsAccess,
  inviteContact,
  loadInviteContacts,
  requestContactsAccess,
} from '@/features/invite/deviceContacts';
import { useMyProfile } from '@/features/profile/hooks';
import { toUserMessage } from '@/lib/errors';
import { inviteMessage, shareInvite } from '@/lib/share';
import { toast } from '@/stores/toast';
import { colors, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';

type Phase = 'checking' | 'explain' | 'requesting' | 'denied' | 'loading' | 'list';

/**
 * Invite from the address book. We explain first and only ask for Contacts
 * access when the person taps Continue. The list is read on device, kept in
 * memory, and never uploaded — tapping a name opens a text they send themselves.
 */
export default function InviteContactsScreen() {
  const insets = useSafeAreaInsets();
  const { data: me } = useMyProfile();
  const [phase, setPhase] = useState<Phase>('checking');
  const [access, setAccess] = useState<ContactsAccess>('undetermined');
  const [contacts, setContacts] = useState<InviteContact[]>([]);
  const [query, setQuery] = useState('');
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<ReadonlySet<string>>(new Set());

  const load = async (granted: ContactsAccess) => {
    setAccess(granted);
    setPhase('loading');
    try {
      setContacts(await loadInviteContacts());
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t read your contacts.'));
    }
    setPhase('list');
  };

  // Already allowed earlier? Skip the explanation. Otherwise explain first.
  useEffect(() => {
    let active = true;
    getContactsAccess()
      .then((current) => {
        if (!active) return;
        if (current === 'all' || current === 'limited') void load(current);
        else setPhase(current === 'denied' ? 'denied' : 'explain');
      })
      .catch(() => active && setPhase('explain'));
    return () => {
      active = false;
    };
  }, []);

  // Back from Settings with Contacts turned on? Pick it up without a restart.
  useEffect(() => {
    if (phase !== 'denied') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getContactsAccess().then((current) => {
        if (current === 'all' || current === 'limited') void load(current);
      });
    });
    return () => subscription.remove();
  }, [phase]);

  const requestAccess = async () => {
    setPhase('requesting');
    try {
      const result = await requestContactsAccess();
      if (result === 'all' || result === 'limited') await load(result);
      else setPhase('denied');
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t ask for contacts access.'));
      setPhase('explain');
    }
  };

  const chooseMore = async () => {
    try {
      await chooseMoreContacts();
      await load('limited');
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t open the contact picker.'));
    }
  };

  const share = async () => {
    if (!me) return;
    try {
      await shareInvite(me);
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t open sharing.'));
    }
  };

  const invite = async (contact: InviteContact) => {
    if (!me) return;
    setInvitingId(contact.id);
    try {
      const result = await inviteContact(contact, inviteMessage(me));
      if (result === 'sent') {
        setInvitedIds((ids) => new Set(ids).add(contact.id));
        toast.success(`Invite sent to ${contact.name}`);
      }
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t open Messages.'));
    }
    setInvitingId(null);
  };

  const visible = filterContacts(contacts, query);
  const limited = access === 'limited';

  return (
    <View style={styles.screen}>
      <AppHeader title="Find from contacts" />

      {phase === 'checking' || phase === 'loading' ? (
        <RowSkeleton count={6} />
      ) : phase === 'explain' || phase === 'requesting' ? (
        <View style={[styles.explain, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.explainBody}>
            <AppText variant="title1">Invite people you already know</AppText>
            <AppText variant="body" color="textSecondary">
              Cheffy can show your contacts so you can text them an invite. Here’s how it works:
            </AppText>
            <Point icon={Smartphone} text="Your contacts stay on your phone. Cheffy never uploads your address book." />
            <Point icon={Lock} text="On iPhone you can share only the contacts you choose." />
            <Point icon={MessageCircle} text="Tap a name to open a text with your invite. Nothing sends until you do." />
          </View>
          <View style={styles.actions}>
            <AppButton
              label="Continue"
              size="lg"
              fullWidth
              loading={phase === 'requesting'}
              onPress={() => void requestAccess()}
              accessibilityHint="Asks for permission to read your contacts"
            />
            <AppButton
              label="Share your invite instead"
              variant="ghost"
              fullWidth
              disabled={!me}
              onPress={() => void share()}
            />
          </View>
        </View>
      ) : phase === 'denied' ? (
        <EmptyState
          icon={BookUser}
          title="Contacts access is off"
          message="Turn on Contacts for Cheffy in Settings, or send your invite with the share sheet — no contacts needed."
          actionLabel="Open Settings"
          onAction={() => void Linking.openSettings()}
          secondaryLabel="Share your invite instead"
          onSecondary={() => void share()}
        />
      ) : (
        <FlashList
          data={visible}
          keyExtractor={(contact) => contact.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {limited ? (
                <View style={styles.limitedBanner}>
                  <AppText variant="callout" color="textSecondary" style={styles.flex}>
                    You’re sharing selected contacts with Cheffy.
                  </AppText>
                  {canChooseMoreContacts() ? (
                    <AppButton label="Choose more" size="sm" variant="secondary" onPress={() => void chooseMore()} />
                  ) : null}
                </View>
              ) : null}
              {contacts.length > 0 ? (
                <AppInput
                  icon={Search}
                  placeholder="Search contacts"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  accessibilityLabel="Search contacts"
                />
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const sent = invitedIds.has(item.id);
            return (
              <View style={styles.row}>
                <Avatar uri={null} name={item.name} size="md" />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {item.name}
                  </AppText>
                  <AppText variant="callout" color="textSecondary">
                    {reachLabel(item)}
                  </AppText>
                </View>
                <AppButton
                  label={sent ? 'Invited' : 'Invite'}
                  size="sm"
                  variant={sent ? 'ghost' : 'secondary'}
                  icon={sent ? undefined : Send}
                  disabled={!me || (invitingId !== null && invitingId !== item.id)}
                  loading={invitingId === item.id}
                  onPress={() => void invite(item)}
                  accessibilityHint={sent ? undefined : `Opens a text to ${item.name} with your invite`}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            contacts.length > 0 ? (
              <EmptyState compact icon={Search} title="No matches" message={`No contacts match “${query.trim()}”.`} />
            ) : (
              <EmptyState
                icon={UserPlus}
                title="No contacts to show"
                message={
                  limited
                    ? 'Choose contacts to share with Cheffy, or send your invite with the share sheet.'
                    : 'Contacts with a phone number or email will show here.'
                }
                actionLabel={limited && canChooseMoreContacts() ? 'Choose contacts' : undefined}
                onAction={limited && canChooseMoreContacts() ? () => void chooseMore() : undefined}
                secondaryLabel="Share your invite instead"
                onSecondary={() => void share()}
              />
            )
          }
        />
      )}
    </View>
  );
}

function Point({ icon: Icon, text }: { icon: typeof Lock; text: string }) {
  return (
    <View style={styles.point}>
      <Icon size={iconSizes.md} color={colors.accent} strokeWidth={strokes.regular} />
      <AppText variant="body" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  explain: { flex: 1, paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.lg, justifyContent: 'space-between' },
  explainBody: { gap: spacing.md },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingTop: spacing.xs },
  actions: { gap: spacing.sm },
  listHeader: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  limitedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
});
