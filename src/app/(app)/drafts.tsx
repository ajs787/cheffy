import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { NotebookPen } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { CategoryLine } from '@/components/shared/CategoryLine';
import {
  AppHeader,
  AppText,
  EmptyState,
  ErrorState,
  FoodImage,
  PressableScale,
  RowSkeleton,
} from '@/components/ui';
import { useDrafts } from '@/features/posts/hooks';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';
import { formatRelativeTime } from '@/utils/dates';

export default function DraftsScreen() {
  const drafts = useDrafts();

  return (
    <View style={styles.screen}>
      <AppHeader title="Drafts" />
      {drafts.isPending ? (
        <RowSkeleton />
      ) : drafts.isError ? (
        <ErrorState error={drafts.error} onRetry={() => void drafts.refetch()} />
      ) : (
        <FlashList
          data={drafts.data}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => (
            <PressableScale
              onPress={() => router.push({ pathname: '/compose', params: { postId: item.id } })}
              activeScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={`Continue draft ${item.title}`}
              style={styles.row}
            >
              <FoodImage
                uri={item.images[0]?.thumbUrl}
                cacheKey={item.images[0]?.thumbPath}
                style={styles.thumb}
                radius="sm"
              />
              <View style={styles.text}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.title}
                </AppText>
                <CategoryLine post={item} />
                <AppText variant="caption" color="textTertiary">
                  Edited {formatRelativeTime(item.updatedAt)}
                </AppText>
              </View>
            </PressableScale>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={NotebookPen}
              title="No drafts"
              message="Use Save draft while logging to finish a post later."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
  thumb: { width: 56, height: 56 },
  text: { flex: 1, gap: 2 },
});
