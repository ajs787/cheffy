import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, Users } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  Avatar,
  CategoryChip,
  Chip,
  EmptyState,
  ErrorState,
  FoodImage,
  RatingRing,
  RowSkeleton,
} from '@/components/ui';
import { useTaxonomy } from '@/features/taxonomy/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, fonts, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';

import { fetchFriendsTop, type FriendTop } from '../experience';

/**
 * What the people you follow rank highest, per category, by their own
 * ratings. Runs as you, so private accounts and posts stay hidden.
 */
export function FriendsRankings({ header }: { header: React.ReactElement }) {
  const taxonomy = useTaxonomy();
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const friends = useQuery({
    queryKey: ['rankings', 'friends', primaryId],
    queryFn: () => fetchFriendsTop(primaryId),
    staleTime: 60_000,
  });
  const { refreshing, onRefresh } = usePullToRefresh(() => friends.refetch());

  return (
    <FlatList
      data={friends.data ?? []}
      keyExtractor={(f) => f.friend.id}
      renderItem={({ item }) => <FriendRow item={item} />}
      ListHeaderComponent={
        <View>
          {header}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            <Chip label="All" selected={primaryId === null} onPress={() => setPrimaryId(null)} />
            {taxonomy.data?.primaries.map((p) => (
              <CategoryChip
                key={p.id}
                slug={p.slug}
                label={p.name}
                selected={primaryId === p.id}
                onPress={() => setPrimaryId(primaryId === p.id ? null : p.id)}
              />
            ))}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        friends.isPending ? (
          <RowSkeleton />
        ) : friends.isError ? (
          <ErrorState error={friends.error} onRetry={() => void friends.refetch()} />
        ) : (
          <EmptyState
            icon={Users}
            title="Nothing ranked yet"
            message="When people you follow rate what they make, their favorites show up here."
            actionLabel="Find friends"
            onAction={() => router.push({ pathname: '/search', params: { tab: 'people' } })}
          />
        )
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
      }
      contentContainerStyle={styles.list}
    />
  );
}

function FriendRow({ item }: { item: FriendTop }) {
  const openRankings = () =>
    router.push({ pathname: '/user/[id]', params: { id: item.friend.id, tab: 'rankings' } });
  return (
    <View style={styles.friend}>
      <Pressable
        onPress={openRankings}
        style={styles.friendHead}
        accessibilityRole="link"
        accessibilityLabel={`${item.friend.displayName}'s rankings`}
      >
        <Avatar uri={item.friend.avatarUrl} name={item.friend.displayName} size="sm" />
        <AppText variant="bodyStrong" style={styles.flex} numberOfLines={1}>
          {item.friend.displayName}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          Rankings
        </AppText>
        <ChevronRight size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
      </Pressable>
      <View style={styles.tops}>
        {item.items.map((top) => (
          <Pressable
            key={top.postId}
            onPress={() => router.push({ pathname: '/post/[id]', params: { id: top.postId } })}
            style={styles.top}
            accessibilityRole="link"
            accessibilityLabel={`Number ${top.rank}, ${top.title}, rated ${top.rating}`}
          >
            <View>
              <FoodImage
                uri={top.thumbUrl}
                cacheKey={top.thumbPath ?? undefined}
                style={styles.thumb}
                radius="md"
              />
              <View style={styles.rankBadge}>
                <AppText style={styles.rank}>{top.rank}</AppText>
              </View>
              <View style={styles.ring}>
                <RatingRing value={top.rating} size="sm" />
              </View>
            </View>
            <AppText variant="caption" numberOfLines={1}>
              {top.title}
            </AppText>
          </Pressable>
        ))}
        {Array.from({ length: Math.max(0, 3 - item.items.length) }, (_, i) => (
          <View key={`gap-${i}`} style={styles.top} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xxl },
  filters: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm },
  friend: { paddingHorizontal: SCREEN_GUTTER, paddingVertical: spacing.md, gap: spacing.sm },
  friendHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  flex: { flex: 1 },
  tops: { flexDirection: 'row', gap: spacing.sm },
  top: { flex: 1, gap: spacing.xs },
  thumb: { width: '100%', aspectRatio: 4 / 3 },
  rankBadge: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  rank: { fontFamily: fonts.display, fontSize: 13, lineHeight: 17, color: colors.ivory },
  ring: { position: 'absolute', right: spacing.xs, bottom: spacing.xs },
});
