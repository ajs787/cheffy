import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Ban, Camera, Ellipsis, Flag, FolderHeart, ListOrdered, Settings, Share2, UserX } from 'lucide-react-native';
import { useState, type ReactElement } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ListFooter } from '@/components/shared/ListFooter';
import { PostGridItem } from '@/components/shared/PostGridItem';
import { RankingRow } from '@/components/shared/RankingRow';
import {
  ActionSheet,
  AppHeader,
  CategoryChip,
  Chip,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  GridSkeleton,
  IconButton,
  RowSkeleton,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { CollectionCard, NewCollectionCard, SavedCard } from '@/features/collections/components/CollectionCard';
import { useCollections } from '@/features/collections/hooks';
import { useDiary } from '@/features/posts/hooks';
import { RankingFilters } from '@/features/rankings/components/RankingFilters';
import { useRankingsController } from '@/features/rankings/useRankingsController';
import { ReportSheet } from '@/features/social/components/ReportSheet';
import { useBlockUser, useUnblockUser } from '@/features/social/hooks';
import { useTaxonomy } from '@/features/taxonomy/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { shareProfile } from '@/lib/share';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';
import type { Collection, ReportTarget } from '@/types/models';

import { useProfile, useProfileStats } from '../hooks';
import { ProfileHeader } from './ProfileHeader';

type Tab = 'diary' | 'rankings' | 'collections';

const TABS = [
  { value: 'diary', label: 'Diary' },
  { value: 'rankings', label: 'Rankings' },
  { value: 'collections', label: 'Collections' },
] as const;

/** A cooking portfolio. Used for your own Profile tab and for other people. */
export function ProfileView({ userId, isOwn }: { userId: string; isOwn: boolean }) {
  const { width } = useWindowDimensions();
  const profile = useProfile(userId);
  const stats = useProfileStats(userId);
  const taxonomy = useTaxonomy();
  const [tab, setTab] = useState<Tab>('diary');
  const [diaryPrimary, setDiaryPrimary] = useState<string | null>(null);
  const diary = useDiary(tab === 'diary' ? userId : undefined, diaryPrimary);
  const rankings = useRankingsController(tab === 'rankings' ? userId : undefined);
  const collections = useCollections(tab === 'collections' ? userId : undefined);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const block = useBlockUser();
  const unblock = useUnblockUser();

  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([
      profile.refetch(),
      stats.refetch(),
      tab === 'diary' ? diary.refetch() : tab === 'rankings' ? rankings.rankings.refetch() : collections.refetch(),
    ]),
  );

  const topBar = isOwn ? (
    <AppHeader
      title={profile.data ? `@${profile.data.username}` : ''}
      leading="none"
      right={<IconButton icon={Settings} label="Settings" onPress={() => router.push('/settings')} />}
    />
  ) : (
    <AppHeader right={profile.data ? <IconButton icon={Ellipsis} label="More options" onPress={() => setMenuOpen(true)} /> : null} />
  );

  if (profile.isPending) {
    return (
      <View style={styles.screen}>
        {topBar}
        <View style={styles.loadingHeader}>
          <Skeleton width={72} height={72} radius={36} />
          <Skeleton width="50%" height={22} />
          <Skeleton width="30%" height={14} />
        </View>
        <GridSkeleton />
      </View>
    );
  }

  if (profile.isError && !profile.data) {
    return (
      <View style={styles.screen}>
        {topBar}
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      </View>
    );
  }

  if (!profile.data) {
    return (
      <View style={styles.screen}>
        {topBar}
        <EmptyState icon={UserX} title="Profile not available" message="This account doesn’t exist or isn’t visible to you." />
      </View>
    );
  }

  const p = profile.data;

  const menu = (
    <>
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          { key: 'share', label: 'Share profile', icon: Share2, onPress: () => void shareProfile(p).catch(() => undefined) },
          {
            key: 'report',
            label: 'Report account',
            icon: Flag,
            destructive: true,
            onPress: () => setReportTarget({ type: 'user', userId: p.id }),
          },
          p.viewerHasBlocked
            ? { key: 'unblock', label: `Unblock @${p.username}`, icon: Ban, onPress: () => unblock.mutate(p.id) }
            : { key: 'block', label: `Block @${p.username}`, icon: Ban, destructive: true, onPress: () => setConfirmBlock(true) },
        ]}
      />
      <ConfirmationDialog
        visible={confirmBlock}
        title={`Block @${p.username}?`}
        message="You won’t see each other’s posts, comments or profiles, and any follows between you are removed. They won’t be notified."
        confirmLabel="Block"
        destructive
        onCancel={() => setConfirmBlock(false)}
        onConfirm={async () => {
          await block.mutateAsync(p.id).catch(() => undefined);
          setConfirmBlock(false);
        }}
      />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
    </>
  );

  if (p.viewerHasBlocked) {
    return (
      <View style={styles.screen}>
        {topBar}
        <EmptyState
          icon={Ban}
          title={`You blocked @${p.username}`}
          message="Unblock to see their posts and let them see yours again."
          actionLabel="Unblock"
          onAction={() => unblock.mutate(p.id)}
        />
        {menu}
      </View>
    );
  }

  const header = (
    <View>
      <ProfileHeader profile={p} stats={stats.data} isOwn={isOwn} />
      <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      <View style={styles.tabHeader}>
        {tab === 'diary' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All" selected={diaryPrimary === null} onPress={() => setDiaryPrimary(null)} />
            {(taxonomy.data?.primaries ?? []).map((primary) => (
              <CategoryChip
                key={primary.id}
                slug={primary.slug}
                label={primary.name}
                selected={diaryPrimary === primary.id}
                onPress={() => setDiaryPrimary(diaryPrimary === primary.id ? null : primary.id)}
              />
            ))}
          </ScrollView>
        ) : null}
        {tab === 'rankings' ? <RankingFilters controller={rankings} /> : null}
      </View>
    </View>
  );

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />;
  const name = isOwn ? 'You' : p.displayName.split(' ')[0];

  let list: ReactElement;
  if (tab === 'diary') {
    const posts = diary.data?.pages.flatMap((page) => page.items) ?? [];
    list = (
      <FlashList
        key="diary"
        data={posts}
        numColumns={3}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostGridItem post={item} size={width / 3} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          diary.isPending ? (
            <GridSkeleton />
          ) : diary.isError ? (
            <ErrorState compact error={diary.error} onRetry={() => void diary.refetch()} />
          ) : (
            <EmptyState
              compact
              icon={Camera}
              title={diaryPrimary ? 'Nothing in this category yet' : isOwn ? 'Your diary is empty' : 'No posts yet'}
              message={isOwn ? 'Everything you log shows up here, newest first.' : `${name} hasn’t shared anything you can see yet.`}
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
  } else if (tab === 'rankings') {
    list = (
      <FlashList
        key="rankings"
        data={rankings.items}
        keyExtractor={(item) => item.postId}
        renderItem={({ item }) => <RankingRow item={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          rankings.rankings.isPending ? (
            <RowSkeleton count={4} />
          ) : rankings.rankings.isError ? (
            <ErrorState compact error={rankings.rankings.error} onRetry={() => void rankings.rankings.refetch()} />
          ) : (
            <EmptyState
              compact
              icon={ListOrdered}
              title={rankings.filtered ? 'Nothing matches these filters' : 'No rankings yet'}
              message={rankings.filtered ? undefined : 'Rankings fill in as creations are rated.'}
            />
          )
        }
        ListFooterComponent={<ListFooter loading={rankings.rankings.isFetchingNextPage} />}
        onEndReached={() => {
          if (rankings.rankings.hasNextPage && !rankings.rankings.isFetchingNextPage) void rankings.rankings.fetchNextPage();
        }}
        refreshControl={refreshControl}
      />
    );
  } else {
    const tileWidth = (width - SCREEN_GUTTER * 2 - spacing.md) / 2;
    type Entry = { kind: 'saved' } | { kind: 'new' } | { kind: 'collection'; collection: Collection };
    const entries: Entry[] = [
      ...(isOwn ? [{ kind: 'saved' } as const, { kind: 'new' } as const] : []),
      ...(collections.data ?? []).map((collection) => ({ kind: 'collection' as const, collection })),
    ];
    list = (
      <FlashList
        key="collections"
        data={collections.isPending ? [] : entries}
        numColumns={2}
        keyExtractor={(entry) => (entry.kind === 'collection' ? entry.collection.id : entry.kind)}
        renderItem={({ item, index }) => (
          <View style={[styles.collectionCell, index % 2 === 0 ? styles.cellLeft : styles.cellRight]}>
            {item.kind === 'saved' ? (
              <SavedCard width={tileWidth} />
            ) : item.kind === 'new' ? (
              <NewCollectionCard width={tileWidth} />
            ) : (
              <CollectionCard collection={item.collection} width={tileWidth} />
            )}
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          collections.isPending ? (
            <GridSkeleton count={4} columns={2} />
          ) : collections.isError ? (
            <ErrorState compact error={collections.error} onRetry={() => void collections.refetch()} />
          ) : (
            <EmptyState compact icon={FolderHeart} title="No collections yet" message={`${name} hasn’t made any public collections.`} />
          )
        }
        refreshControl={refreshControl}
      />
    );
  }

  return (
    <View style={styles.screen}>
      {topBar}
      {list}
      {!isOwn ? menu : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loadingHeader: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md, paddingBottom: spacing.xl },
  tabHeader: { paddingTop: spacing.md, paddingBottom: spacing.sm },
  chips: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  collectionCell: { paddingBottom: spacing.lg },
  cellLeft: { paddingLeft: SCREEN_GUTTER, paddingRight: spacing.md / 2 },
  cellRight: { paddingRight: SCREEN_GUTTER, paddingLeft: spacing.md / 2 },
});
