import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { NotebookPen, Smartphone, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CategoryLine } from '@/components/shared/CategoryLine';
import {
  AppHeader,
  AppText,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  FoodImage,
  IconButton,
  PressableScale,
  RowSkeleton,
} from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { hasContent, readComposeRecovery, type ComposeRecovery } from '@/features/posts/composeRecovery';
import { useDeletePost, useDrafts } from '@/features/posts/hooks';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';
import { colors, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { Post } from '@/types/models';
import { formatRelativeTime } from '@/utils/dates';

/** An entry that was never saved but is kept on this phone (see composeRecovery). */
function useUnsavedEntry() {
  const me = useUserId();
  const [entry, setEntry] = useState<ComposeRecovery | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      let active = true;
      void readComposeRecovery(me).then((saved) => {
        if (active) setEntry(saved && saved.mode === 'new' && hasContent(saved.values) ? saved : null);
      });
      return () => {
        active = false;
      };
    }, [me]),
  );
  return entry;
}

export default function DraftsScreen() {
  const drafts = useDrafts();
  const unsaved = useUnsavedEntry();
  const deletePost = useDeletePost();
  const [toDelete, setToDelete] = useState<Post | null>(null);

  const unsavedRow = unsaved ? (
    <PressableScale
      onPress={() => router.push('/compose')}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Unsaved entry ${unsaved.values.title || 'untitled'}, kept on this phone`}
      style={styles.row}
      testID="drafts-unsaved-entry"
    >
      <View style={[styles.thumb, styles.unsavedThumb]}>
        <Smartphone size={iconSizes.md} color={colors.textSecondary} strokeWidth={strokes.regular} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {unsaved.values.title.trim() || 'Untitled entry'}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          Not saved yet · kept on this phone
        </AppText>
        <AppText variant="caption" color="textTertiary">
          Edited {formatRelativeTime(new Date(unsaved.savedAt).toISOString())}
        </AppText>
      </View>
    </PressableScale>
  ) : null;

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
          ListHeaderComponent={unsavedRow}
          renderItem={({ item }) => (
            <View style={styles.rowWrap}>
              <PressableScale
                onPress={() => router.push({ pathname: '/compose', params: { postId: item.id } })}
                activeScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={`Continue draft ${item.title}`}
                style={[styles.row, styles.flex]}
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
              <IconButton
                icon={Trash2}
                label={`Delete draft ${item.title}`}
                onPress={() => setToDelete(item)}
                size="md"
              />
            </View>
          )}
          ListEmptyComponent={
            unsaved ? null : (
              <EmptyState
                icon={NotebookPen}
                title="No drafts"
                message="Use Save draft while logging to finish a post later."
              />
            )
          }
        />
      )}
      <ConfirmationDialog
        visible={!!toDelete}
        title="Delete this draft?"
        message={toDelete ? `“${toDelete.title}” and its photos will be gone for good.` : undefined}
        confirmLabel="Delete draft"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deletePost.mutateAsync(toDelete);
            haptics.success();
            toast.success('Draft deleted');
          } catch (error) {
            haptics.error();
            toast.error(toUserMessage(error, 'Couldn’t delete the draft. Try again.'));
          } finally {
            setToDelete(null);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
  thumb: { width: 56, height: 56 },
  unsavedThumb: {
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
