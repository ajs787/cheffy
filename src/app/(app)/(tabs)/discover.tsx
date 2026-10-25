import { router } from 'expo-router';
import { Compass, Search, UserPlus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PostGrid } from '@/components/shared/PostGrid';
import { SectionHeader } from '@/components/shared/SectionHeader';
import {
  AppHeader,
  AppText,
  EmptyState,
  ErrorState,
  GridSkeleton,
  IconButton,
  PressableScale,
} from '@/components/ui';
import { CategoryTiles } from '@/features/discover/components/CategoryTiles';
import { DiscoverRow } from '@/features/discover/components/DiscoverRow';
import { MostHatedRow } from '@/features/discover/components/MostHatedRow';
import { SuggestedCooks } from '@/features/discover/components/SuggestedCooks';
import { useDiscoverGrid, useTrending } from '@/features/discover/hooks';
import { useTaxonomy } from '@/features/taxonomy/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useTabScrollToTop } from '@/hooks/useTabScrollToTop';
import { queryKeys } from '@/lib/query/keys';
import type { Post } from '@/types/models';
import { colors, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';

const LATEST = { sort: 'recent' } as const;

function browse(params: Record<string, string>) {
  router.push({ pathname: '/browse', params });
}

export default function DiscoverScreen() {
  const qc = useQueryClient();
  const taxonomy = useTaxonomy();
  const trending = useTrending();
  const latest = useDiscoverGrid(LATEST);
  const listRef = useTabScrollToTop<Post>();
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['posts', 'discover'] }),
      qc.invalidateQueries({ queryKey: queryKeys.trending }),
      qc.invalidateQueries({ queryKey: queryKeys.mostHated }),
      qc.invalidateQueries({ queryKey: queryKeys.suggestedCooks }),
    ]),
  );

  const posts = latest.data?.pages.flatMap((page) => page.items) ?? [];

  const header = (
    <View>
      <PressableScale
        onPress={() => router.push('/search')}
        activeScale={0.98}
        accessibilityRole="search"
        accessibilityLabel="Search people, dishes, drinks and tags"
        style={styles.search}
      >
        <Search size={iconSizes.md} color={colors.textTertiary} strokeWidth={strokes.regular} />
        <AppText variant="body" color="textTertiary">
          Search dishes, drinks, people, tags
        </AppText>
      </PressableScale>

      <CategoryTiles categories={taxonomy.data?.primaries ?? []} />
      <View style={styles.sectionsTop} />

      <DiscoverRow
        title="From your friends"
        params={{ sort: 'recent', followingOnly: true }}
        onSeeAll={() => browse({ followingOnly: '1', title: 'From your friends' })}
      />
      <DiscoverRow
        title="Top rated this month"
        params={{ sort: 'top', sinceDays: 30 }}
        onSeeAll={() => browse({ sort: 'top', sinceDays: '30', title: 'Top rated this month' })}
      />
      <DiscoverRow
        title="Most loved"
        subtitle="Most liked in the last two weeks"
        params={{ sort: 'loved', sinceDays: 14 }}
        onSeeAll={() => browse({ sort: 'loved', sinceDays: '14', title: 'Most loved' })}
      />
      <MostHatedRow />
      <DiscoverRow
        title="Budget Eats"
        subtitle="Homemade and easy on the wallet"
        params={{ sort: 'top', budget: true, sinceDays: 60 }}
        onSeeAll={() => browse({ budget: '1', title: 'Budget Eats' })}
      />
      {(trending.data ?? []).slice(0, 4).map((item) => {
        const title = item.kind === 'tag' ? `#${item.name}` : item.name;
        const params =
          item.kind === 'tag'
            ? { sort: 'recent' as const, tagId: item.id }
            : { sort: 'recent' as const, categoryId: item.id };
        return (
          <DiscoverRow
            key={`${item.kind}:${item.id}`}
            title={title}
            subtitle={`Trending · ${item.postCount} recent posts`}
            params={params}
            onSeeAll={() =>
              browse(item.kind === 'tag' ? { tagId: item.id, title } : { categoryId: item.id, title })
            }
          />
        );
      })}
      <SuggestedCooks />
      {posts.length > 0 ? (
        <SectionHeader title="Just posted" subtitle="The latest from the community" />
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader
        variant="large"
        title="Discover"
        right={
          <IconButton icon={UserPlus} label="Find friends" onPress={() => router.push('/find-friends')} />
        }
      />
      <PostGrid
        listRef={listRef}
        posts={posts}
        header={header}
        empty={
          latest.isPending ? (
            <GridSkeleton count={4} columns={2} />
          ) : latest.isError ? (
            // An outage isn't "nothing posted yet".
            <ErrorState error={latest.error} onRetry={() => void latest.refetch()} />
          ) : (
            <EmptyState
              icon={Compass}
              title="The table is just getting set"
              message="Cheffy is new. As people share public entries, the best of them land here — yours could be first."
              actionLabel="Log something you made"
              onAction={() => router.push('/compose')}
              secondaryLabel="Find friends to follow"
              onSecondary={() => router.push('/find-friends')}
            />
          )
        }
        loadingMore={latest.isFetchingNextPage}
        onEndReached={() => {
          if (latest.hasNextPage && !latest.isFetchingNextPage) void latest.fetchNextPage();
        }}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: SCREEN_GUTTER,
    height: 44,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionsTop: { height: spacing.xxl },
});
