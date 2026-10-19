import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Bookmark, ChefHat, Search, UserPlus } from 'lucide-react-native';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListFooter } from '@/components/shared/ListFooter';
import { PostCard } from '@/components/shared/PostCard';
import { AppButton, AppText, Divider, EmptyState, ErrorState, IconButton, PostCardSkeleton, PressableScale } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { useFeed } from '@/features/feed/hooks';
import { usePostMenu } from '@/features/posts/components/usePostMenu';
import { useProfileStats } from '@/features/profile/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, fonts, radii, SCREEN_GUTTER, spacing } from '@/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const me = useUserId();
  const feed = useFeed();
  const stats = useProfileStats(me ?? undefined);
  const menu = usePostMenu();
  const { refreshing, onRefresh } = usePullToRefresh(() => Promise.all([feed.refetch(), stats.refetch()]));

  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const followsNobody = stats.data?.following === 0;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <AppText style={styles.wordmark} accessibilityRole="header">
        Cheffy
      </AppText>
      <View style={styles.headerActions}>
        <IconButton icon={Search} label="Search" onPress={() => router.push('/search')} />
        <IconButton icon={Bookmark} label="Saved" onPress={() => router.push('/saved')} />
      </View>
    </View>
  );

  if (feed.isPending) {
    return (
      <View style={styles.screen}>
        {header}
        <PostCardSkeleton />
        <PostCardSkeleton />
      </View>
    );
  }

  if (feed.isError && posts.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <FlashList
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item, index }) => <PostCard post={item} onOpenMenu={menu.open} priority={index < 2} />}
        ItemSeparatorComponent={() => <Divider style={styles.separator} />}
        ListHeaderComponent={followsNobody && posts.length > 0 ? <FindFriendsBanner /> : null}
        ListEmptyComponent={
          <EmptyState
            icon={followsNobody ? UserPlus : ChefHat}
            title={followsNobody ? 'Cheffy is better with friends' : 'Nothing new yet'}
            message={
              followsNobody
                ? 'Follow friends to see what they’re cooking, baking and pouring — or log your first creation.'
                : 'When the people you follow log something, it shows up here.'
            }
            actionLabel="Find friends"
            onAction={() => router.push({ pathname: '/search', params: { tab: 'people' } })}
            secondaryLabel="Log something you made"
            onSecondary={() => router.push('/compose')}
          />
        }
        ListFooterComponent={<ListFooter loading={feed.isFetchingNextPage} />}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
        showsVerticalScrollIndicator={false}
      />
      {menu.element}
    </View>
  );
}

function FindFriendsBanner() {
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/search', params: { tab: 'people' } })}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel="Find friends to follow"
      style={styles.banner}
    >
      <UserPlus size={20} color={colors.sageStrong} />
      <View style={styles.bannerText}>
        <AppText variant="bodyStrong">Find your friends</AppText>
        <AppText variant="caption" color="textSecondary">
          Follow people to fill your feed with what they’re making.
        </AppText>
      </View>
      <AppButton label="Search" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/search', params: { tab: 'people' } })} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: SCREEN_GUTTER,
    paddingRight: spacing.xs,
    paddingBottom: spacing.xs,
  },
  wordmark: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: colors.accentStrong },
  headerActions: { flexDirection: 'row' },
  separator: { marginVertical: spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: SCREEN_GUTTER,
    marginVertical: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.sageSoft,
  },
  bannerText: { flex: 1, gap: 2 },
});
