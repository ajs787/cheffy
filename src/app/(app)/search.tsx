import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { Hash, Search, SearchX, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostGrid } from '@/components/shared/PostGrid';
import { UserRow } from '@/components/shared/UserRow';
import { AppText, EmptyState, ErrorState, GridSkeleton, PressableScale, RowSkeleton, SegmentedControl } from '@/components/ui';
import { usePostSearch, useTagSearch } from '@/features/discover/hooks';
import { useSuggestedCooks, useUserSearch } from '@/features/social/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { colors, fonts, HIT_TARGET, iconSizes, MAX_FONT_SCALE, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';

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
            placeholder={tab === 'people' ? 'Name or @username' : tab === 'tags' ? 'Tag' : 'Dish, drink, cuisine, tag'}
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
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
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
      {tab === 'creations' ? <CreationResults q={q} /> : tab === 'people' ? <PeopleResults q={q} /> : <TagResults q={q} />}
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

function PeopleResults({ q }: { q: string }) {
  const search = useUserSearch(q);
  const suggested = useSuggestedCooks();
  const showingSuggestions = q.length === 0;
  const query = showingSuggestions ? suggested : search;
  const users = query.data ?? [];

  if (query.isPending && !showingSuggestions) return <RowSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <FlashList
      data={users}
      keyExtractor={(user) => user.id}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <UserRow user={item} />}
      ListHeaderComponent={
        showingSuggestions && users.length > 0 ? (
          <AppText variant="overline" color="textSecondary" style={styles.listLabel}>
            Suggested
          </AppText>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon={Users}
          compact
          title={showingSuggestions ? 'Find your friends' : `No one matches “${q}”`}
          message={showingSuggestions ? 'Search by name or username to follow people.' : 'Check the spelling, or try their username.'}
        />
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

function TagResults({ q }: { q: string }) {
  const tags = useTagSearch(q);
  if (q.length < 1) return <EmptyState icon={Hash} compact title="Browse by tag" message="Try “iced”, “comfort food” or “brown butter”." />;
  if (tags.isPending) return <RowSkeleton count={4} />;
  if (tags.isError) return <ErrorState error={tags.error} onRetry={() => void tags.refetch()} />;

  return (
    <FlashList
      data={tags.data ?? []}
      keyExtractor={(tag) => tag.id}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <PressableScale
          onPress={() => router.push({ pathname: '/browse', params: { tagId: item.id, title: `#${item.name}` } })}
          activeScale={0.98}
          accessibilityRole="link"
          style={styles.tagRow}
        >
          <View style={styles.tagIcon}>
            <Hash size={iconSizes.sm} color={colors.sageStrong} strokeWidth={strokes.bold} />
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
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: SCREEN_GUTTER, paddingRight: spacing.sm },
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
  input: { flex: 1, fontFamily: fonts.sans, fontSize: 16, color: colors.text, height: '100%' },
  cancel: { minHeight: HIT_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  gridTop: { height: spacing.lg },
  listContent: { paddingTop: spacing.sm },
  listLabel: { paddingHorizontal: SCREEN_GUTTER, paddingVertical: spacing.sm },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: SCREEN_GUTTER, paddingVertical: spacing.sm },
  tagIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
