import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Compass, Search } from 'lucide-react-native';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { ListFooter } from '@/components/shared/ListFooter';
import { PostGridItem } from '@/components/shared/PostGridItem';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { AppHeader, AppText, CategoryIcon, EmptyState, GridSkeleton, PressableScale } from '@/components/ui';
import { DiscoverRow } from '@/features/discover/components/DiscoverRow';
import { SuggestedCooks } from '@/features/discover/components/SuggestedCooks';
import { useDiscoverGrid, useTrending } from '@/features/discover/hooks';
import { useTaxonomy } from '@/features/taxonomy/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { queryKeys } from '@/lib/query/keys';
import { colors, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';

const LATEST = { sort: 'recent' } as const;

function browse(params: Record<string, string>) {
  router.push({ pathname: '/browse', params });
}

export default function DiscoverScreen() {
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const taxonomy = useTaxonomy();
  const trending = useTrending();
  const latest = useDiscoverGrid(LATEST);
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['posts', 'discover'] }),
      qc.invalidateQueries({ queryKey: queryKeys.trending }),
      qc.invalidateQueries({ queryKey: queryKeys.suggestedCooks }),
    ]),
  );

  const posts = latest.data?.pages.flatMap((page) => page.items) ?? [];
  const cardWidth = (width - SCREEN_GUTTER * 2 - spacing.md) / 2;

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

      <View style={styles.categories}>
        {(taxonomy.data?.primaries ?? []).map((primary) => (
          <PressableScale
            key={primary.id}
            onPress={() => browse({ primaryId: primary.id, title: primary.name })}
            activeScale={0.96}
            accessibilityRole="link"
            accessibilityLabel={`Browse ${primary.name}`}
            style={styles.categoryTile}
          >
            <CategoryIcon slug={primary.slug} size="lg" />
            <AppText variant="calloutStrong">{primary.name}</AppText>
          </PressableScale>
        ))}
      </View>

      <DiscoverRow
        title="What friends are making"
        params={{ sort: 'recent', followingOnly: true }}
        onSeeAll={() => browse({ followingOnly: '1', title: 'What friends are making' })}
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
      {(trending.data ?? []).slice(0, 4).map((item) => {
        const title = item.kind === 'tag' ? `#${item.name}` : item.name;
        const params = item.kind === 'tag' ? { sort: 'recent' as const, tagId: item.id } : { sort: 'recent' as const, categoryId: item.id };
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
      {posts.length > 0 ? <SectionHeader title="Fresh from the community" /> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader title="Discover" large />
      <FlashList
        data={posts}
        numColumns={2}
        keyExtractor={(post) => post.id}
        renderItem={({ item, index }) => (
          <View style={[styles.cell, index % 2 === 0 ? styles.cellLeft : styles.cellRight]}>
            <PostGridItem post={item} size={cardWidth} variant="card" />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          latest.isPending ? (
            <GridSkeleton count={4} columns={2} />
          ) : (
            <EmptyState
              icon={Compass}
              title="Nothing to discover yet"
              message="As people share public posts, the best of them will show up here."
            />
          )
        }
        ListFooterComponent={<ListFooter loading={latest.isFetchingNextPage} />}
        onEndReached={() => {
          if (latest.hasNextPage && !latest.isFetchingNextPage) void latest.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
        showsVerticalScrollIndicator={false}
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
    height: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categories: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: SCREEN_GUTTER,
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
  },
  categoryTile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cell: { paddingBottom: spacing.lg },
  cellLeft: { paddingLeft: SCREEN_GUTTER, paddingRight: spacing.md / 2 },
  cellRight: { paddingRight: SCREEN_GUTTER, paddingLeft: spacing.md / 2 },
});
