import { router, useLocalSearchParams } from 'expo-router';
import { Ellipsis, FolderOpen, Lock, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/shared/PostGrid';
import {
  ActionSheet,
  AppHeader,
  AppText,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  GridSkeleton,
  IconButton,
} from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { useCollection, useCollectionPosts, useDeleteCollection } from '@/features/collections/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import { pluralize } from '@/utils/format';

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUserId();
  const collection = useCollection(id);
  const posts = useCollectionPosts(id);
  const deleteCollection = useDeleteCollection();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(() => Promise.all([collection.refetch(), posts.refetch()]));

  const c = collection.data;
  const own = c?.ownerId === me;
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.screen}>
      <AppHeader right={own ? <IconButton icon={Ellipsis} label="Collection options" onPress={() => setMenuOpen(true)} /> : null} />
      {collection.isPending ? (
        <GridSkeleton count={4} columns={2} />
      ) : collection.isError ? (
        <ErrorState error={collection.error} onRetry={() => void collection.refetch()} />
      ) : !c ? (
        <EmptyState icon={FolderOpen} title="Collection not available" message="It may be private or deleted." />
      ) : (
        <PostGrid
          posts={items}
          header={
            <View style={styles.header}>
              <AppText variant="title1" accessibilityRole="header">
                {c.name}
              </AppText>
              {c.description ? (
                <AppText variant="body" color="textSecondary">
                  {c.description}
                </AppText>
              ) : null}
              <View style={styles.meta}>
                {c.visibility === 'private' ? <Lock size={12} color={colors.textSecondary} strokeWidth={strokes.bold} /> : null}
                <AppText variant="caption" color="textSecondary">
                  {c.visibility === 'private' ? 'Private · ' : ''}
                  {pluralize(c.itemCount, 'item')}
                </AppText>
              </View>
            </View>
          }
          empty={
            posts.isPending ? (
              <GridSkeleton count={4} columns={2} />
            ) : (
              <EmptyState
                compact
                icon={FolderOpen}
                title="Empty for now"
                message={own ? 'Add posts from the ••• menu on any post.' : undefined}
              />
            )
          }
          loadingMore={posts.isFetchingNextPage}
          onEndReached={() => {
            if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
          }}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
        />
      )}

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            key: 'edit',
            label: 'Edit collection',
            icon: Pencil,
            onPress: () => router.push({ pathname: '/collection/edit', params: { id } }),
          },
          { key: 'delete', label: 'Delete collection', icon: Trash2, destructive: true, onPress: () => setConfirmDelete(true) },
        ]}
      />
      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete this collection?"
        message="The posts in it won’t be affected."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteCollection.mutateAsync(id).catch(() => undefined);
          setConfirmDelete(false);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: SCREEN_GUTTER, paddingBottom: spacing.xl, gap: spacing.xs + 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
