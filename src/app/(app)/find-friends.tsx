import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { BookUser, Search, Send, UserSearch, X } from 'lucide-react-native';
import { memo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UserRow } from '@/components/shared/UserRow';
import {
  AppHeader,
  AppInput,
  AppText,
  Avatar,
  EmptyState,
  PressableScale,
  RowSkeleton,
} from '@/components/ui';
import { contactsSupported } from '@/features/invite/deviceContacts';
import { useMyProfile } from '@/features/profile/hooks';
import { AlsoKnow } from '@/features/social/components/AlsoKnow';
import { NewToCheffy } from '@/features/social/components/NewToCheffy';
import { SuggestionCard } from '@/features/social/components/SuggestionCard';
import {
  useDiscoveryPeople,
  useDismissSuggestion,
  usePeopleSearch,
  useSuggestedFriends,
} from '@/features/social/hooks';
import { useRecentPeople } from '@/features/social/recentPeople';
import { useInviteCode } from '@/features/unlocks/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toUserMessage } from '@/lib/errors';
import { shareInvite } from '@/lib/share';
import { toast } from '@/stores/toast';
import { colors, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { ProfileSummary, UserListItem } from '@/types/models';

/**
 * Find Friends: search people on Cheffy, jump back to people you recently
 * looked at, follow suggestions (each with its real reason), and invite the
 * rest. Contacts stay on the phone; nobody is labelled a contact match.
 */
export default function FindFriendsScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 250);
  const searching = query.trim().length > 0;
  const recents = useRecentPeople();
  const open = (person: ProfileSummary) => {
    recents.add(person);
    router.push({ pathname: '/user/[id]', params: { id: person.id } });
  };

  return (
    <View style={styles.screen}>
      <AppHeader title="Find Friends" />
      <View style={styles.searchWrap}>
        <AppInput
          icon={Search}
          onChangeText={setQuery}
          placeholder="Search by name or username"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search people on Cheffy"
        />
      </View>
      {searching ? (
        <SearchResults q={q} pending={q !== query.trim()} onOpen={recents.add} />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl, gap: spacing.xl }}
        >
          {recents.people.length > 0 ? (
            <Recents
              people={recents.people}
              onOpen={open}
              onRemove={recents.remove}
              onClear={recents.clear}
            />
          ) : null}
          <Suggested onOpen={open} />
          <PeopleYouMayKnow onOpen={recents.add} />
          <InviteCard />
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Search results: a plain vertical list, paged, with an invite at the end.
// ---------------------------------------------------------------------------
function SearchResults({
  q,
  pending,
  onOpen,
}: {
  q: string;
  pending: boolean;
  onOpen: (user: UserListItem) => void;
}) {
  const search = usePeopleSearch(q);
  const people = search.data?.pages.flat() ?? [];

  if (pending || search.isPending) return <RowSkeleton count={4} />;
  return (
    <FlashList
      data={people}
      keyExtractor={(u) => u.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => <UserRow user={item} onOpen={onOpen} />}
      onEndReached={() => {
        if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
      }}
      ListEmptyComponent={
        <EmptyState
          icon={UserSearch}
          compact
          title={`No one matches “${q}”`}
          message="Check the spelling or try their username. Not on Cheffy yet? Invite them."
        />
      }
      ListFooterComponent={
        <>
          {people.length > 0 && !search.hasNextPage ? <AlsoKnow exclude={people} onOpen={onOpen} /> : null}
          <View style={styles.resultsFooter}>
            <InviteRow />
          </View>
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Recents: circles with a remove button, plus "Clear all".
// ---------------------------------------------------------------------------
function Recents({
  people,
  onOpen,
  onRemove,
  onClear,
}: {
  people: ProfileSummary[];
  onOpen: (p: ProfileSummary) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="overline" color="textSecondary">
          Recent
        </AppText>
        <Pressable
          onPress={onClear}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear all recents"
        >
          <AppText variant="caption" color="accent">
            Clear all
          </AppText>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={people}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hRow}
        renderItem={({ item }) => <RecentPerson person={item} onOpen={onOpen} onRemove={onRemove} />}
      />
    </View>
  );
}

const RecentPerson = memo(function RecentPerson({
  person,
  onOpen,
  onRemove,
}: {
  person: ProfileSummary;
  onOpen: (p: ProfileSummary) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <View style={styles.recent}>
      <PressableScale
        onPress={() => onOpen(person)}
        activeScale={0.96}
        accessibilityRole="link"
        accessibilityLabel={`${person.displayName}, @${person.username}`}
        style={styles.recentBody}
      >
        <Avatar uri={person.avatarUrl} name={person.displayName} size="lg" />
        <AppText variant="caption" numberOfLines={1} align="center" style={styles.recentName}>
          {person.displayName}
        </AppText>
        <AppText
          variant="caption"
          color="textTertiary"
          numberOfLines={1}
          align="center"
          style={styles.recentName}
        >
          @{person.username}
        </AppText>
      </PressableScale>
      <Pressable
        onPress={() => onRemove(person.id)}
        hitSlop={8}
        style={styles.remove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${person.displayName} from recents`}
      >
        <X size={12} color={colors.ivory} strokeWidth={strokes.bold + 0.5} />
      </Pressable>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Suggested for you: horizontal cards, each with its reason and a dismiss X.
// ---------------------------------------------------------------------------
function Suggested({ onOpen }: { onOpen: (p: ProfileSummary) => void }) {
  const { suggested: all, newcomers, suggestedQuery: suggested } = useDiscoveryPeople();
  const dismiss = useDismissSuggestion();
  const people = all.slice(0, SUGGESTION_CARDS);

  if (suggested.isPending) return <RowSkeleton count={2} />;
  if (people.length === 0) return <NewToCheffy people={newcomers} header="label" onOpen={onOpen} />;
  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <AppText variant="overline" color="textSecondary">
            Suggested for you
          </AppText>
          {(suggested.data?.length ?? 0) > 3 ? (
            <Pressable
              onPress={() => router.push('/suggested')}
              hitSlop={10}
              accessibilityRole="link"
              accessibilityLabel="See all suggestions"
            >
              <AppText variant="caption" color="accent">
                See all
              </AppText>
            </Pressable>
          ) : null}
        </View>
        <FlatList
          horizontal
          data={people}
          keyExtractor={(p) => p.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hRow}
          initialNumToRender={4}
          renderItem={({ item }) => (
            <SuggestionCard
              person={item}
              detail={item.reason}
              onOpen={onOpen}
              onDismiss={(id) => dismiss.mutate(id)}
            />
          )}
        />
      </View>
      <NewToCheffy people={newcomers} header="label" onOpen={onOpen} />
    </>
  );
}

// ---------------------------------------------------------------------------
// People you may know: friends of friends beyond the top cards, as rows.
// Same request as the cards (no extra fetch); shown only when real mutual
// follows back it.
// ---------------------------------------------------------------------------
const SUGGESTION_CARDS = 10;

function PeopleYouMayKnow({ onOpen }: { onOpen: (user: UserListItem) => void }) {
  const suggested = useSuggestedFriends();
  const people = (suggested.data ?? []).slice(SUGGESTION_CARDS).filter((p) => p.mutualCount > 0);
  if (people.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="overline" color="textSecondary">
          People you may know
        </AppText>
      </View>
      <View>
        {people.map((person) => (
          <UserRow key={person.id} user={person} detail={person.reason} onOpen={onOpen} />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Invite: one tap to the native share sheet with a working cheffy.me link.
// ---------------------------------------------------------------------------
function useShareInvite() {
  const { data: me } = useMyProfile();
  const code = useInviteCode();
  return async () => {
    if (!me) return;
    try {
      await shareInvite(me, code.data);
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t open sharing.'));
    }
  };
}

function InviteCard() {
  const share = useShareInvite();
  return (
    <View style={[styles.section, styles.gutter]}>
      <View style={styles.invite}>
        <AppText variant="title2" style={styles.ivory}>
          Cooking is better with friends
        </AppText>
        <AppText variant="callout" style={styles.rose}>
          Send your invite link. If they don’t have Cheffy yet, it takes them to get it and keeps your code.
        </AppText>
        <PressableScale
          onPress={() => void share()}
          activeScale={0.98}
          accessibilityRole="button"
          accessibilityLabel="Invite friends"
          style={styles.inviteButton}
        >
          <Send size={iconSizes.md} color={colors.oxblood} strokeWidth={strokes.bold} />
          <AppText variant="button" style={styles.inviteButtonText}>
            Invite friends
          </AppText>
        </PressableScale>
        <View style={styles.inviteLinks}>
          {contactsSupported() ? (
            <Pressable
              onPress={() => router.push('/invite-contacts')}
              hitSlop={8}
              accessibilityRole="link"
              style={styles.inviteLink}
            >
              <BookUser size={iconSizes.sm} color={colors.ivory} strokeWidth={strokes.regular} />
              <AppText variant="caption" style={styles.ivory}>
                Invite from contacts
              </AppText>
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push('/invite')} hitSlop={8} accessibilityRole="link">
            <AppText variant="caption" style={styles.ivory}>
              Your invite code & rewards
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function InviteRow() {
  const share = useShareInvite();
  return (
    <PressableScale
      onPress={() => void share()}
      activeScale={0.98}
      accessibilityRole="button"
      style={styles.inviteRow}
    >
      <View style={styles.inviteIcon}>
        <Send size={iconSizes.sm} color={colors.ivory} strokeWidth={strokes.regular} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">Invite a friend to Cheffy</AppText>
        <AppText variant="caption" color="textSecondary">
          Share your link by text, Instagram or anywhere
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: SCREEN_GUTTER, paddingBottom: spacing.md },
  flex: { flex: 1, gap: 2 },
  gutter: { paddingHorizontal: SCREEN_GUTTER },
  section: { gap: spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
  },
  hRow: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
  recent: { width: 76 },
  recentBody: { alignItems: 'center', gap: 2 },
  recentName: { width: 76 },
  remove: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.imageScrim,
  },
  invite: { gap: spacing.md, padding: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.oxblood },
  ivory: { color: colors.ivory },
  rose: { color: '#E3C4C9' },
  // Ivory on oxblood, so it reads clearly on the card.
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.ivory,
  },
  inviteButtonText: { color: colors.oxblood },
  inviteLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  inviteLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  resultsFooter: { paddingHorizontal: SCREEN_GUTTER, paddingVertical: spacing.lg },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.tint,
  },
  inviteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
