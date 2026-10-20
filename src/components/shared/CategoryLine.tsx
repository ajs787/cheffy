import { StyleSheet, View } from 'react-native';

import { AppText, categoryColorFor } from '@/components/ui';
import { spacing } from '@/theme';
import type { Post } from '@/types/models';

/** "● DRINKS · MATCHA · ICED" — tracked capitals, the identity's label style. */
export function CategoryLine({
  post,
}: {
  post: Pick<Post, 'primary' | 'subcategory' | 'cuisine' | 'temperature' | 'dishType'>;
}) {
  const parts = [
    post.primary.name,
    post.subcategory?.name ?? post.cuisine?.name,
    post.dishType?.name,
    post.temperature === 'iced' ? 'Iced' : post.temperature === 'hot' ? 'Hot' : undefined,
  ].filter(Boolean);
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: categoryColorFor(post.primary.slug) }]} />
      <AppText variant="overline" color="textSecondary" numberOfLines={1} style={styles.text}>
        {parts.join(' · ')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { flexShrink: 1 },
});
