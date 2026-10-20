import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Camera, ChevronRight, FolderHeart, ListOrdered, NotebookPen } from 'lucide-react-native';
import { useState, type ReactElement } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ListFooter } from '@/components/shared/ListFooter';
import { twoColumnCellStyle, useTwoColumnWidth } from '@/components/shared/PostGrid';
import { PostGridItem } from '@/components/shared/PostGridItem';
import { RankingRow } from '@/components/shared/RankingRow';
import {
  AppText,
  CategoryChip,
  Chip,
  EmptyState,
  ErrorState,
  GridSkeleton,
  PressableScale,
  RowSkeleton,
} from '@/components/ui';
import {
  CollectionCard,
  NewCollectionCard,
  SavedCard,
} from '@/features/collections/components/CollectionCard';
import { useCollections } from '@/features/collections/hooks';
import { useDiary, useDrafts } from '@/features/posts/hooks';
import { RankingFilters } from '@/features/rankings/components/RankingFilters';
import { useRankingsController } from '@/features/rankings/useRankingsController';
import { useTaxonomy } from '@/features/taxonomy/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useTabScrollToTop } from '@/hooks/useTabScrollToTop';
import { colors, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { Collection, Post, RankingItem } from '@/types/models';
import { pluralize } from '@/utils/format';

export interface ProfileTabProps {
  userId: string;
  isOwn: boolean;
  /** First name or "You", for empty-state copy. */
  name: string;
  /** Profile header + tab switcher, rendered at the top of the tab's list. */
  header: ReactElement;
  /** Refreshes the profile header data alongside the tab's own list. */
  onRefreshProfile: () => Promise<unknown>;
}

function useRefresh(onRefreshProfile: () => Promise<unknown>, refetchList: () => Promise<unknown>) {
  const { refreshing, onRefresh } = usePullToRefresh(() => Promise.all([onRefreshProfile(), refetchList()]));
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />;
}

// ---------------------------------------------------------------------------
// Diary: photo grid by date made, filterable by primary category.
// ---------------------------------------------------------------------------
export function DiaryTab({ userId, isOwn, name, header, onRefreshProfile }: ProfileTabProps) {
  const { width } = useWindowDimensions();
  const taxonomy = useTaxonomy();
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const diary = useDiary(userId, primaryId);
  const drafts = useDrafts(isOwn);
  const draftCount = drafts.data?.length ?? 0;
  const listRef = useTabScrollToTop<Post>();
  const refreshControl = useRefresh(onRefreshProfile, () => diary.refetch());
  const posts = diary.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <FlashList
      ref={listRef}
      data={posts}
      numColumns={3}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <PostGridItem post={item} size={width / 3} />}
      ListHeaderComponent={
        <View>
          {header}
          <View style={styles.tabHeader}>
            {isOwn && draftCount > 0 ? (
              <PressableScale
                onPress={() => router.push('/drafts')}
                activeScale={0.98}
                accessibilityRole="link"
                accessibilityLabel={`${pluralize(draftCount, 'unfinished draft')}`}
                style={styles.draftsRow}
              >
                <NotebookPen size={iconSizes.md} color={colors.textSecondary} strokeWidth={strokes.regular} />
                <AppText variant="calloutStrong" style={styles.flex}>
                  {pluralize(draftCount, 'draft')} to finish
                </AppText>
                <ChevronRight size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
              </PressableScale>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Chip label="All" selected={primaryId === null} onPress={() => setPrimaryId(null)} />
              {(taxonomy.data?.primaries ?? []).map((primary) => (
                <CategoryChip
                  key={primary.id}
                  slug={primary.slug}
                  label={primary.name}
                  selected={primaryId === primary.id}
                  onPress={() => setPrimaryId(primaryId === primary.id ? null : primary.id)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      }
      ListEmptyComponent={
        diary.isPending ? (
          <GridSkeleton />
        ) : diary.isError ? (
          <ErrorState compact error={diary.error} onRetry={() => void diary.refetch()} />
        ) : (
          <EmptyState
            compact
            icon={Camera}
            title={
              primaryId ? 'Nothing in this category yet' : isOwn ? 'Your diary is empty' : 'No posts yet'
            }
            message={
              isOwn
                ? 'Everything you log shows up here, newest first.'
                : `${name} hasn’t shared anything you can see yet.`
            }
            actionLabel={isOwn ? 'Log something you made' : undefined}
            onAction={isOwn ? () => router.push('/compose') : undefined}
          />
        )
      }
      ListFooterComponent={<ListFooter loading={diary.isFetchingNextPage} />}
      onEndReached={() => {
        if (diary.hasNextPage && !diary.isFetchingNextPage) void diary.fetchNextPage();
      }}
      refreshControl={refreshControl}
    />
  );
}

// ---------------------------------------------------------------------------
// Rankings: the same ranked list as the Rankings tab, for this person.
// ---------------------------------------------------------------------------
export function RankingsTab({ userId, header, onRefreshProfile }: ProfileTabProps) {
  const controller = useRankingsController(userId);
  const { rankings, items, filtered } = controller;
  const listRef = useTabScrollToTop<RankingItem>();
  const refreshControl = useRefresh(onRefreshProfile, () => rankings.refetch());

  return (
    <FlashList
      ref={listRef}
      data={items}
      keyExtractor={(item) => item.postId}
      renderItem={({ item }) => <RankingRow item={item} />}
      ListHeaderComponent={
        <View>
          {header}
          <View style={styles.tabHeader}>
            <RankingFilters controller={controller} />
          </View>
        </View>
      }
      ListEmptyComponent={
        rankings.isPending ? (
          <RowSkeleton count={4} />
        ) : rankings.isError ? (
          <ErrorState compact error={rankings.error} onRetry={() => void rankings.refetch()} />
        ) : (
          <EmptyState
            compact
            icon={ListOrdered}
            title={filtered ? 'Nothing matches these filters' : 'No rankings yet'}
            message={filtered ? undefined : 'Rankings fill in as creations are rated.'}
          />
        )
      }
      ListFooterComponent={<ListFooter loading={rankings.isFetchingNextPage} />}
      onEndReached={() => {
        if (rankings.hasNextPage && !rankings.isFetchingNextPage) void rankings.fetchNextPage();
      }}
      refreshControl={refreshControl}
    />
  );
}

// ---------------------------------------------------------------------------
// Collections: named lists; your own profile adds Saved and New tiles.
// ---------------------------------------------------------------------------
type CollectionEntry = { kind: 'saved' } | { kind: 'new' } | { kind: 'collection'; collection: Collection };

export function CollectionsTab({ userId, isOwn, name, header, onRefreshProfile }: ProfileTabProps) {
  const tileWidth = useTwoColumnWidth();
  const collections = useCollections(userId);
  const listRef = useTabScrollToTop<CollectionEntry>();
  const refreshControl = useRefresh(onRefreshProfile, () => collections.refetch());
  const entries: CollectionEntry[] = [
    ...(isOwn ? [{ kind: 'saved' } as const, { kind: 'new' } as const] : []),
    ...(collections.data ?? []).map((collection) => ({ kind: 'collection' as const, collection })),
  ];

  return (
    <FlashList
      ref={listRef}
      data={collections.isPending ? [] : entries}
      numColumns={2}
      keyExtractor={(entry) => (entry.kind === 'collection' ? entry.collection.id : entry.kind)}
      renderItem={({ item, index }) => (
        <View style={[styles.collectionCell, twoColumnCellStyle(index)]}>
          {item.kind === 'saved' ? (
            <SavedCard width={tileWidth} />
          ) : item.kind === 'new' ? (
            <NewCollectionCard width={tileWidth} />
          ) : (
            <CollectionCard collection={item.collection} width={tileWidth} />
          )}
        </View>
      )}
      ListHeaderComponent={
        <View>
          {header}
          <View style={styles.tabHeader} />
        </View>
      }
      ListEmptyComponent={
        collections.isPending ? (
          <GridSkeleton count={4} columns={2} />
        ) : collections.isError ? (
          <ErrorState compact error={collections.error} onRetry={() => void collections.refetch()} />
        ) : (
          <EmptyState
            compact
            icon={FolderHeart}
            title="No collections yet"
            message={`${name} hasn’t made any public collections.`}
          />
        )
      }
      refreshControl={refreshControl}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabHeader: { paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.md },
  draftsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: SCREEN_GUTTER,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chips: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  collectionCell: { paddingBottom: spacing.lg },
});
