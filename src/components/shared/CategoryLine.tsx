import { StyleSheet, View } from 'react-native';

import { AppText, categoryColorFor } from '@/components/ui';
import { spacing } from '@/theme';
import type { Post } from '@/types/models';

type CategoryLinePost = Pick<Post, 'primary' | 'subcategories' | 'cuisines' | 'temperature' | 'dishTypes'>;

/**
 * "DRINKS · MATCHA · LATTES · ICED" (pure, for testing). Lists the
 * subcategories (or cuisines when there are none), then dish types; long
 * lists collapse to "+N".
 */
export function categoryLineParts(post: CategoryLinePost, max = 3): string[] {
  const kinds = post.subcategories.length > 0 ? post.subcategories : post.cuisines;
  const names = [...kinds, ...post.dishTypes].map((c) => c.name);
  const shown = names.length > max ? [...names.slice(0, max - 1), `+${names.length - (max - 1)}`] : names;
  const temperature = post.temperature === 'iced' ? 'Iced' : post.temperature === 'hot' ? 'Hot' : null;
  return [post.primary.name, ...shown, ...(temperature ? [temperature] : [])];
}

/** "● DRINKS · MATCHA · ICED" — tracked capitals, the identity's label style. */
export function CategoryLine({ post }: { post: CategoryLinePost }) {
  const parts = categoryLineParts(post);
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
