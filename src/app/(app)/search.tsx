import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { Hash, Search, SearchX, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostGrid } from '@/components/shared/PostGrid';
import { ListFooter } from '@/components/shared/ListFooter';
import { UserRow } from '@/components/shared/UserRow';
import {
  AppText,
  Avatar,
  EmptyState,
  ErrorState,
  GridSkeleton,
  PressableScale,
  RowSkeleton,
  SegmentedControl,
} from '@/components/ui';
import { usePostSearch, useTagSearch } from '@/features/discover/hooks';
import { AlsoKnow } from '@/features/social/components/AlsoKnow';
import { usePeopleSearch, useSuggestedFriends } from '@/features/social/hooks';
import { useRecentPeople } from '@/features/social/recentPeople';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  colors,
  fonts,
  HIT_TARGET,
  iconSizes,
  MAX_FONT_SCALE,
  radii,
  SCREEN_GUTTER,
  spacing,
  strokes,
} from '@/theme';
import type { ProfileSummary } from '@/types/models';

type Tab = 'creations' | 'people' | 'tags';

const TABS = [
  { value: 'creations', label: 'Creations' },
  { value: 'people', label: 'People' },
  { value: 'tags', label: 'Tags' },
] as const;

export default function SearchScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'creations');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 300);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.bar}>
        <View style={styles.inputWrap}>
          <Search size={iconSizes.md} color={colors.textTertiary} strokeWidth={strokes.regular} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={
              tab === 'people' ? 'Name or @username' : tab === 'tags' ? 'Tag' : 'Dish, drink, cuisine, tag'
            }
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            accessibilityLabel="Search"
            style={styles.input}
            testID="search-input"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={iconSizes.sm} color={colors.textSecondary} strokeWidth={strokes.bold} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.cancel} accessibilityRole="button">
          <AppText variant="calloutStrong" color="textSecondary">
            Cancel
          </AppText>
        </Pressable>
      </View>
      <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      {tab === 'creations' ? (
        <CreationResults q={q} />
      ) : tab === 'people' ? (
        <PeopleResults q={q} />
      ) : (
        <TagResults q={q} />
      )}
    </View>
  );
}

function CreationResults({ q }: { q: string }) {
  const search = usePostSearch(q);
  const posts = search.data?.pages.flatMap((page) => page.items) ?? [];

  if (q.length < 2) {
    return (
      <EmptyState
        icon={Search}
        compact
        title="Find something to make"
        message="Search names like “focaccia”, categories like “matcha”, or tags like “weeknight”."
      />
    );
  }
  if (search.isPending) return <GridSkeleton count={4} columns={2} />;
  if (search.isError) return <ErrorState error={search.error} onRetry={() => void search.refetch()} />;

  return (
    <PostGrid
      posts={posts}
      header={<View style={styles.gridTop} />}
      empty={<EmptyState icon={SearchX} compact title={`No results for “${q}”`} />}
      loadingMore={search.isFetchingNextPage}
      onEndReached={() => {
        if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
      }}
      dismissKeyboardOnDrag
    />
  );
}

/**
 * People: with no query, people you looked at recently and suggestions
 * (each with its reason); with a query, matches only, best first and paged,
 * then a few "You might also know" below them.
 */
function PeopleResults({ q }: { q: string }) {
  const search = usePeopleSearch(q);
  const suggested = useSuggestedFriends();
  const recents = useRecentPeople();
  const searching = q.length > 0;

  if (!searching) {
    const people = suggested.data ?? [];
    return (
      <FlashList
        data={people}
        keyExtractor={(user) => user.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <UserRow user={item} detail={item.reason} onOpen={recents.add} />}
        ListHeaderComponent={
          <>
            {recents.people.length > 0 ? (
              <>
                <AppText variant="overline" color="textSecondary" style={styles.listLabel}>
                  Recent
                </AppText>
                {recents.people.slice(0, 5).map((person) => (
                  <RecentRow key={person.id} person={person} onOpen={recents.add} />
                ))}
              </>
            ) : null}
            {people.length > 0 ? (
              <AppText variant="overline" color="textSecondary" style={styles.listLabel}>
                Suggested for you
              </AppText>
            ) : null}
          </>
        }
        ListEmptyComponent={
          suggested.isPending ? (
            <RowSkeleton />
          ) : recents.people.length === 0 ? (
            <EmptyState
              icon={Users}
              compact
              title="Find your friends"
              message="Search by name or username to follow people."
            />
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
    );
  }

  const users = search.data?.pages.flat() ?? [];
  if (search.isPending) return <RowSkeleton />;
  if (search.isError) return <ErrorState error={search.error} onRetry={() => void search.refetch()} />;
  return (
    <FlashList
      data={users}
      keyExtractor={(user) => user.id}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <UserRow user={item} onOpen={recents.add} />}
      onEndReached={() => {
        if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
      }}
      ListEmptyComponent={
        <EmptyState
          icon={Users}
          compact
          title={`No one matches “${q}”`}
          message="Check the spelling, or try their username."
        />
      }
      ListFooterComponent={
        users.length > 0 && !search.hasNextPage ? (
          <AlsoKnow exclude={users} onOpen={recents.add} />
        ) : (
          <ListFooter loading={search.isFetchingNextPage} />
        )
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

/** A recently opened profile (no follow state is stored for recents). */
function RecentRow({ person, onOpen }: { person: ProfileSummary; onOpen: (p: ProfileSummary) => void }) {
  return (
    <PressableScale
      onPress={() => {
        onOpen(person);
        router.push({ pathname: '/user/[id]', params: { id: person.id } });
      }}
      activeScale={0.98}
      accessibilityRole="link"
      accessibilityLabel={`${person.displayName}, @${person.username}`}
      style={styles.recentRow}
    >
      <Avatar uri={person.avatarUrl} name={person.displayName} size="md" />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {person.displayName}
        </AppText>
        <AppText variant="callout" color="textSecondary" numberOfLines={1}>
          @{person.username}
        </AppText>
      </View>
    </PressableScale>
  );
}

function TagResults({ q }: { q: string }) {
  const tags = useTagSearch(q);
  if (q.length < 1)
    return (
      <EmptyState
        icon={Hash}
        compact
        title="Browse by tag"
        message="Try “iced”, “comfort food” or “brown butter”."
      />
    );
  if (tags.isPending) return <RowSkeleton count={4} />;
  if (tags.isError) return <ErrorState error={tags.error} onRetry={() => void tags.refetch()} />;

  return (
    <FlashList
      data={tags.data ?? []}
      keyExtractor={(tag) => tag.id}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <PressableScale
          onPress={() =>
            router.push({ pathname: '/browse', params: { tagId: item.id, title: `#${item.name}` } })
          }
          activeScale={0.98}
          accessibilityRole="link"
          style={styles.tagRow}
        >
          <View style={styles.tagIcon}>
            <Hash size={iconSizes.sm} color={colors.accent} strokeWidth={strokes.bold} />
          </View>
          <AppText variant="bodyStrong">{item.name}</AppText>
        </PressableScale>
      )}
      ListEmptyComponent={<EmptyState icon={SearchX} compact title={`No tags match “${q}”`} />}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: SCREEN_GUTTER,
    paddingRight: spacing.sm,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, fontFamily: fonts.text, fontSize: 16, color: colors.text, height: '100%' },
  cancel: { minHeight: HIT_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  gridTop: { height: spacing.lg },
  listContent: { paddingTop: spacing.sm },
  flex: { flex: 1 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
  listLabel: { paddingHorizontal: SCREEN_GUTTER, paddingVertical: spacing.sm },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
  tagIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
