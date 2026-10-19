import { FlatList, StyleSheet, View } from 'react-native';

import { PostGridItem } from '@/components/shared/PostGridItem';
import { SectionHeader } from '@/components/shared/SectionHeader';
import type { DiscoverQueryParams } from '@/lib/query/keys';
import { SCREEN_GUTTER, spacing } from '@/theme';

import { useDiscoverSection } from '../hooks';

const CARD_WIDTH = 148;

export interface DiscoverRowProps {
  title: string;
  subtitle?: string;
  params: DiscoverQueryParams;
  onSeeAll: () => void;
}

/** A horizontal section. Renders nothing unless real posts back it. */
export function DiscoverRow({ title, subtitle, params, onSeeAll }: DiscoverRowProps) {
  const section = useDiscoverSection(params);
  const posts = section.data ?? [];
  if (posts.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} subtitle={subtitle} onSeeAll={posts.length >= 4 ? onSeeAll : undefined} />
      <FlatList
        horizontal
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostGridItem post={item} size={CARD_WIDTH} variant="card" />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        initialNumToRender={4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xxl },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
});
