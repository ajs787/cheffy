import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Hash, Search } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/shared/PostGrid';
import { PostGridItem } from '@/components/shared/PostGridItem';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { AppText, EmptyState, GridSkeleton, PressableScale, RowSkeleton } from '@/components/ui';
import { colors, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { Post } from '@/types/models';
import { formatCount } from '@/utils/format';

import type { SuggestedTag, TagResult } from '../api';
import { useNewlyCooked, useTagSuggestions, useTasteSection, useTrendingCreations } from '../hooks';

const CARD_WIDTH = 148;
const ROW_MAX = 10;

/** A horizontal row of cards under a section header; nothing when empty. */
function CardRow({
  title,
  subtitle,
  posts,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  posts: Post[];
  onSeeAll?: () => void;
}) {
  if (posts.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={title} subtitle={subtitle} onSeeAll={posts.length >= 4 ? onSeeAll : undefined} />
      <FlatList
        horizontal
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostGridItem post={item} size={CARD_WIDTH} variant="card" showDetail />}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.cards}
        initialNumToRender={3}
        windowSize={3}
      />
    </View>
  );
}

/**
 * Search › Creations before anything is typed: For Your Taste, Trending,
 * then Newly Cooked as a paged grid. Each creation shows up once, in the
 * first section that has it; empty sections are hidden.
 */
export function CreationSuggestions() {
  const taste = useTasteSection();
  const trending = useTrendingCreations();
  const fresh = useNewlyCooked();

  const { tastePosts, trendingPosts, freshPosts } = useMemo(() => {
    const seen = new Set<string>();
    const take = (posts: Post[], max = Infinity) => {
      const out: Post[] = [];
      for (const post of posts) {
        if (out.length >= max) break;
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        out.push(post);
      }
      return out;
    };
    return {
      tastePosts: take(taste.data ?? [], ROW_MAX),
      trendingPosts: take(trending.data?.pages[0]?.items ?? [], ROW_MAX),
      freshPosts: take(fresh.data?.pages.flatMap((page) => page.items) ?? []),
    };
  }, [taste.data, trending.data, fresh.data]);

  const loading = taste.isPending && trending.isPending && fresh.isPending;
  const nothing = !loading && tastePosts.length === 0 && trendingPosts.length === 0 && freshPosts.length === 0;

  if (loading) return <GridSkeleton count={4} columns={2} />;
  if (nothing) {
    return (
      <EmptyState
        icon={Search}
        compact
        title="Find something to make"
        message="Search names like “focaccia”, categories like “matcha”, or tags like “weeknight”."
      />
    );
  }

  const header = (
    <View style={styles.top}>
      <CardRow
        title="For Your Taste"
        subtitle="Picked for you"
        posts={tastePosts}
        onSeeAll={() => router.push('/taste')}
      />
      <CardRow
        title="Trending"
        subtitle="Getting the most likes and comments lately"
        posts={trendingPosts}
        onSeeAll={() => router.push('/trending')}
      />
      {freshPosts.length > 0 ? <SectionHeader title="Newly Cooked" subtitle="Fresh from the kitchen" /> : null}
    </View>
  );

  return (
    <PostGrid
      posts={freshPosts}
      header={header}
      empty={<View />}
      loadingMore={fresh.isFetchingNextPage}
      onEndReached={() => {
        if (fresh.hasNextPage && !fresh.isFetchingNextPage) void fresh.fetchNextPage();
      }}
      dismissKeyboardOnDrag
    />
  );
}

/** Opens Browse filtered to one tag. */
export function openTag(tag: TagResult) {
  router.push({ pathname: '/browse', params: { tagId: tag.id, title: `#${tag.name}` } });
}

/** A tag in a list: icon, name, and (when known) how many creations it has. */
export const TagRow = memo(function TagRow({ tag }: { tag: TagResult | SuggestedTag }) {
  const count = 'postCount' in tag ? tag.postCount : null;
  return (
    <PressableScale
      onPress={() => openTag(tag)}
      activeScale={0.98}
      accessibilityRole="link"
      accessibilityLabel={count != null ? `#${tag.name}, ${count} creations` : `#${tag.name}`}
      style={styles.tagRow}
    >
      <View style={styles.tagIcon}>
        <Hash size={iconSizes.sm} color={colors.accent} strokeWidth={strokes.bold} />
      </View>
      <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
        {tag.name}
      </AppText>
      {count != null ? (
        <AppText variant="caption" color="textTertiary">
          {formatCount(count)} {count === 1 ? 'creation' : 'creations'}
        </AppText>
      ) : null}
    </PressableScale>
  );
});

type TagItem = { type: 'label'; key: string; title: string } | { type: 'tag'; key: string; tag: SuggestedTag };

/**
 * Search › Tags before anything is typed: tags for the viewer, popular tags
 * (by recent use) and a few popular ones outside their usual. Empty lists
 * are left out.
 */
export function TagSuggestionList() {
  const lists = useTagSuggestions();

  const items = useMemo(() => {
    const out: TagItem[] = [];
    const add = (key: string, title: string, tags: SuggestedTag[] | undefined) => {
      if (!tags?.length) return;
      out.push({ type: 'label', key: `label:${key}`, title });
      for (const tag of tags) out.push({ type: 'tag', key: `${key}:${tag.id}`, tag });
    };
    add('suggested', 'Suggested for you', lists.data?.suggested);
    add('popular', 'Popular tags', lists.data?.popular);
    add('explore', 'Explore something new', lists.data?.explore);
    return out;
  }, [lists.data]);

  if (lists.isPending) return <RowSkeleton count={4} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Hash}
        compact
        title="Browse by tag"
        message="Try “iced”, “comfort food” or “brown butter”."
      />
    );
  }

  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.type}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) =>
        item.type === 'label' ? (
          <AppText variant="overline" color="textSecondary" style={styles.listLabel}>
            {item.title}
          </AppText>
        ) : (
          <TagRow tag={item.tag} />
        )
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg },
  section: { marginBottom: spacing.xxl },
  cards: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
  flex: { flex: 1 },
  listContent: { paddingTop: spacing.sm },
  listLabel: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.md, paddingBottom: spacing.sm },
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
