import { FlatList, StyleSheet, View } from 'react-native';

import { PostGridItem } from '@/components/shared/PostGridItem';
import { AppText } from '@/components/ui';
import { useDiscoverSection } from '@/features/discover/hooks';
import { SCREEN_GUTTER, spacing } from '@/theme';

const PARAMS = { sort: 'top', sinceDays: 7 } as const;
const CARD = 124;

/** "Top rated this week" from real ratings. Needs at least two entries to show. */
export function TopRatedStrip() {
  const section = useDiscoverSection(PARAMS);
  const posts = section.data ?? [];
  if (posts.length < 2) return null;

  return (
    <View style={styles.module}>
      <AppText variant="overline" color="textSecondary" style={styles.label}>
        Top rated this week
      </AppText>
      <FlatList
        horizontal
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostGridItem post={item} size={CARD} variant="card" />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  module: { gap: spacing.sm, paddingTop: spacing.sm },
  label: { paddingHorizontal: SCREEN_GUTTER },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
});
