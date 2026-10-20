import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { ChefHat, Compass, Search, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ListFooter } from '@/components/shared/ListFooter';
import { PostCard } from '@/components/shared/PostCard';
import {
  AppButton,
  AppHeader,
  AppText,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  PostCardSkeleton,
  PressableScale,
  SegmentedControl,
} from '@/components/ui';
import { ActivityBell } from '@/features/activity/components/ActivityBell';
import { useUserId } from '@/features/auth/store';
import type { FeedMode } from '@/features/feed/api';
import { CookingLately } from '@/features/feed/components/CookingLately';
import { TopRatedStrip } from '@/features/feed/components/TopRatedStrip';
import { useFeed } from '@/features/feed/hooks';
import { usePostMenu } from '@/features/posts/components/usePostMenu';
import { useProfileStats } from '@/features/profile/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useTabScrollToTop } from '@/hooks/useTabScrollToTop';
import { colors, radii, SCREEN_GUTTER, spacing } from '@/theme';
import type { Post } from '@/types/models';

const MODES = [
  { value: 'following', label: 'Following' },
  { value: 'forYou', label: 'For You' },
] as const;

export default function HomeScreen() {
  const me = useUserId();
  const stats = useProfileStats(me ?? undefined);
  const followsNobody = stats.data?.following === 0;
  // Until you choose, people who follow nobody start on For You.
  const [chosenMode, setChosenMode] = useState<FeedMode | null>(null);
  const mode: FeedMode = chosenMode ?? (followsNobody ? 'forYou' : 'following');

  const feed = useFeed(mode);
  const menu = usePostMenu();
  const listRef = useTabScrollToTop<Post>();
  const { refreshing, onRefresh } = usePullToRefresh(() => Promise.all([feed.refetch(), stats.refetch()]));
  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];

  const header = (
    <View>
      <SegmentedControl options={MODES} value={mode} onChange={setChosenMode} />
      {mode === 'following' ? (
        <>
          {followsNobody ? <FindFriendsBanner /> : null}
          <CookingLately />
        </>
      ) : (
        <TopRatedStrip />
      )}
      <View style={styles.headerEnd} />
    </View>
  );

  const empty =
    mode === 'following' ? (
      <EmptyState
        icon={followsNobody ? UserPlus : ChefHat}
        title={followsNobody ? 'Your table is empty' : 'Nothing new yet'}
        message={
          followsNobody
            ? 'Follow friends to see what they’re cooking, baking and pouring here.'
            : 'When the people you follow log something, it shows up here.'
        }
        actionLabel="Find friends"
        onAction={() => router.push({ pathname: '/search', params: { tab: 'people' } })}
        secondaryLabel="See what everyone’s making"
        onSecondary={() => setChosenMode('forYou')}
      />
    ) : (
      <EmptyState
        icon={Compass}
        title="The community is just getting started"
        message="Public entries from other cooks appear here. Log yours to help get the table going."
        actionLabel="Log something you made"
        onAction={() => router.push('/compose')}
      />
    );

  return (
    <View style={styles.screen}>
      <AppHeader
        variant="brand"
        right={
          <>
            <IconButton icon={Search} label="Search" onPress={() => router.push('/search')} />
            <ActivityBell />
          </>
        }
      />
      {feed.isPending ? (
        <View>
          {header}
          <PostCardSkeleton />
        </View>
      ) : feed.isError && posts.length === 0 ? (
        <View>
          {header}
          <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
        </View>
      ) : (
        <FlashList
          key={mode}
          ref={listRef}
          data={posts}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => <PostCard post={item} onOpenMenu={menu.open} />}
          ItemSeparatorComponent={() => <Divider style={styles.separator} />}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ListFooterComponent={<ListFooter loading={feed.isFetchingNextPage} />}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
          }}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      {menu.element}
    </View>
  );
}

function FindFriendsBanner() {
  const open = () => router.push({ pathname: '/search', params: { tab: 'people' } });
  return (
    <PressableScale onPress={open} activeScale={0.98} accessibilityRole="button" accessibilityLabel="Find friends to follow" style={styles.banner}>
      <UserPlus size={20} color={colors.accent} />
      <View style={styles.bannerText}>
        <AppText variant="bodyStrong">Find your friends</AppText>
        <AppText variant="caption" color="textSecondary">
          Follow people to fill this feed with what they’re making.
        </AppText>
      </View>
      <AppButton label="Search" size="sm" variant="secondary" onPress={open} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerEnd: { height: spacing.sm },
  separator: { marginHorizontal: SCREEN_GUTTER },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: SCREEN_GUTTER,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.tint,
  },
  bannerText: { flex: 1, gap: 2 },
});
