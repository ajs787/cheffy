import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListFooter } from '@/components/shared/ListFooter';
import { UserRow } from '@/components/shared/UserRow';
import { AppText, EmptyState, ErrorState, RowSkeleton } from '@/components/ui';
import { usePost } from '@/features/posts/hooks';
import { useLikers } from '@/features/social/hooks';
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
            <EmptyState icon={Heart} compact title="No likes yet" message="Be the first to show it some love." />
          }
          ListFooterComponent={<ListFooter loading={likers.isFetchingNextPage} />}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
