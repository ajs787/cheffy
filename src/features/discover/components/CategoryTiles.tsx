import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, CategoryIcon, FoodImage, PressableScale } from '@/components/ui';
import { colors, radii, SCREEN_GUTTER, spacing } from '@/theme';
import type { Category } from '@/types/models';

import { useDiscoverSection } from '../hooks';

const GAP = spacing.sm;

/** One category: the newest real entry's photo as its cover, or a quiet glyph tile. */
function CategoryTile({ category, width }: { category: Category; width: number }) {
  const latest = useDiscoverSection({ sort: 'recent', primaryId: category.id });
  const cover = latest.data?.find((post) => post.images[0]?.thumbUrl)?.images[0];

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/browse', params: { primaryId: category.id, title: category.name } })}
      activeScale={0.96}
      accessibilityRole="link"
      accessibilityLabel={`Browse ${category.name}`}
      style={[styles.tile, { width }]}
    >
      {cover ? (
        <>
          <FoodImage uri={cover.thumbUrl} cacheKey={cover.thumbPath} radius={0} style={StyleSheet.absoluteFill} />
          <View style={styles.labelBand}>
            <AppText variant="overline" style={styles.labelOnPhoto}>
              {category.name}
            </AppText>
          </View>
        </>
      ) : (
        <View style={styles.plain}>
          <CategoryIcon slug={category.slug} size="lg" />
          <AppText variant="overline">{category.name}</AppText>
        </View>
      )}
    </PressableScale>
  );
}

/** Compact category navigation for Discover. */
export function CategoryTiles({ categories }: { categories: Category[] }) {
  const { width } = useWindowDimensions();
  if (categories.length === 0) return null;
  const tileWidth = (width - SCREEN_GUTTER * 2 - GAP * (categories.length - 1)) / categories.length;
  return (
    <View style={styles.row}>
      {categories.map((category) => (
        <CategoryTile key={category.id} category={category} width={tileWidth} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP, paddingHorizontal: SCREEN_GUTTER },
  tile: { height: 84, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.tint },
  plain: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs + 2 },
  labelBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: spacing.xs + 1,
    alignItems: 'center',
    backgroundColor: colors.imageScrim,
  },
  labelOnPhoto: { color: colors.ivory },
});
