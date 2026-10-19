import { FlashList } from '@shopify/flash-list';
import type { ReactElement } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors, SCREEN_GUTTER, spacing } from '@/theme';
import type { Post } from '@/types/models';

import { ListFooter } from './ListFooter';
import { PostGridItem } from './PostGridItem';

export interface PostGridProps {
  posts: Post[];
  header?: ReactElement | null;
  empty: ReactElement;
  loadingMore: boolean;
  onEndReached: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}

/** Two-column card grid used by collections and saved posts. */
export function PostGrid({ posts, header, empty, loadingMore, onEndReached, refreshing, onRefresh }: PostGridProps) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - SCREEN_GUTTER * 2 - spacing.md) / 2;
  return (
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
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFooter loading={loadingMore} />}
      onEndReached={onEndReached}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
    />
  );
}

const styles = StyleSheet.create({
  cell: { paddingBottom: spacing.lg },
  cellLeft: { paddingLeft: SCREEN_GUTTER, paddingRight: spacing.md / 2 },
  cellRight: { paddingRight: SCREEN_GUTTER, paddingLeft: spacing.md / 2 },
});
