import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { ReactElement, Ref } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors, SCREEN_GUTTER, spacing } from '@/theme';
import type { Post } from '@/types/models';

import { ListFooter } from './ListFooter';
import { PostGridItem } from './PostGridItem';

const GAP = spacing.md;

/** Width of one tile in the app's two-column card grids. */
export function useTwoColumnWidth(): number {
  const { width } = useWindowDimensions();
  return (width - SCREEN_GUTTER * 2 - GAP) / 2;
}

/** Cell padding for item `index` in a two-column grid with screen gutters. */
export function twoColumnCellStyle(index: number) {
  return index % 2 === 0 ? styles.cellLeft : styles.cellRight;
}

export interface PostGridProps {
  posts: Post[];
  header?: ReactElement | null;
  empty: ReactElement;
  loadingMore: boolean;
  onEndReached: () => void;
  /** Omit to disable pull-to-refresh. */
  onRefresh?: () => void;
  refreshing?: boolean;
  listRef?: Ref<FlashListRef<Post>>;
  dismissKeyboardOnDrag?: boolean;
}

/** The two-column card grid used by Discover, Search, Browse, Saved and collections. */
export function PostGrid({
  posts,
  header,
  empty,
  loadingMore,
  onEndReached,
  onRefresh,
  refreshing = false,
  listRef,
  dismissKeyboardOnDrag = false,
}: PostGridProps) {
  const cardWidth = useTwoColumnWidth();
  return (
    <FlashList
      ref={listRef}
      data={posts}
      numColumns={2}
      keyExtractor={(post) => post.id}
      renderItem={({ item, index }) => (
        <View style={[styles.cell, twoColumnCellStyle(index)]}>
          <PostGridItem post={item} size={cardWidth} variant="card" />
        </View>
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFooter loading={loadingMore} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      keyboardDismissMode={dismissKeyboardOnDrag ? 'on-drag' : 'none'}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  cell: { paddingBottom: spacing.lg },
  cellLeft: { paddingLeft: SCREEN_GUTTER, paddingRight: GAP / 2 },
  cellRight: { paddingRight: SCREEN_GUTTER, paddingLeft: GAP / 2 },
});
