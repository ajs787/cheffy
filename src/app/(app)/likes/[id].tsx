import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListFooter } from '@/components/shared/ListFooter';
import { UserRow } from '@/components/shared/UserRow';
import { AppText, EmptyState, ErrorState, RowSkeleton } from '@/components/ui';
import { AnonymousAvatar } from '@/features/comments/components/AnonymousAvatar';
import { usePost } from '@/features/posts/hooks';
import { useAnonymousLikeCount, useLikers } from '@/features/social/hooks';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';
import { formatCount } from '@/utils/format';

/**
 * Who liked a post, shown as a native sheet over the post or feed. Each row
 * opens the person's profile and has their Follow / Following / Requested
 * button. People hidden by a block aren't listed.
 */
export default function LikesSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const post = usePost(id);
  const likers = useLikers(id);
  const anonymous = useAnonymousLikeCount(id).data ?? 0;
  const users = likers.data?.pages.flat() ?? [];
  const total = post.data?.likeCount ?? users.length;

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <AppText variant="title2" accessibilityRole="header">
          Likes
        </AppText>
        {total > 0 ? (
          <AppText variant="callout" color="textSecondary">
            {formatCount(total)} {total === 1 ? 'like' : 'likes'}
          </AppText>
        ) : null}
      </View>
      {likers.isPending ? (
        <RowSkeleton count={5} />
      ) : likers.isError ? (
        <ErrorState error={likers.error} onRetry={() => void likers.refetch()} />
      ) : (
        <FlashList
          data={users}
          keyExtractor={(user) => user.id}
          renderItem={({ item }) => <UserRow user={item} />}
          onEndReached={() => {
            if (likers.hasNextPage && !likers.isFetchingNextPage) void likers.fetchNextPage();
          }}
          ListEmptyComponent={
            anonymous > 0 ? null : (
              <EmptyState icon={Heart} compact title="No likes yet" message="Be the first to show it some love." />
            )
          }
          ListFooterComponent={
            <>
              <ListFooter loading={likers.isFetchingNextPage} />
              {anonymous > 0 && !likers.hasNextPage ? (
                <View style={styles.anonymousRow} testID="likes-anonymous-row">
                  <AnonymousAvatar size="sm" />
                  <AppText variant="callout" color="textSecondary">
                    {anonymous === 1 ? '1 chef' : `${formatCount(anonymous)} chefs`} liked anonymously
                  </AppText>
                </View>
              ) : null}
            </>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anonymousRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.md,
  },
  sheet: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
});
