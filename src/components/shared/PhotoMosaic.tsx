import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, FoodImage } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import type { PostImage } from '@/types/models';

const GAP = spacing.xs;

export interface PhotoMosaicProps {
  images: PostImage[];
  width: number;
  title: string;
  onPress: () => void;
}

/**
 * Balanced, inset photos for a feed card: one photo at 4:3, or up to three
 * squares with a "+N" on the last. Food stays the hero without taking over
 * the entry the way a full-bleed portrait photo does.
 */
export function PhotoMosaic({ images, width, title, onPress }: PhotoMosaicProps) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    const image = images[0]!;
    return (
      <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={`${title}, photo`}>
        <FoodImage
          uri={image.url ?? image.thumbUrl}
          cacheKey={image.url ? image.storagePath : image.thumbPath}
          style={{ width, height: (width * 3) / 4 }}
          radius="md"
          priority="high"
        />
      </Pressable>
    );
  }

  const shown = images.slice(0, 3);
  const extra = images.length - shown.length;
  const size = (width - GAP * (shown.length - 1)) / shown.length;
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="imagebutton"
      accessibilityLabel={`${title}, ${images.length} photos`}
    >
      {shown.map((image, i) => (
        <View key={image.id}>
          <FoodImage
            uri={i === 0 ? (image.url ?? image.thumbUrl) : image.thumbUrl}
            cacheKey={i === 0 && image.url ? image.storagePath : image.thumbPath}
            style={{ width: size, height: shown.length === 2 ? size * 1.15 : size }}
            radius="md"
          />
          {i === shown.length - 1 && extra > 0 ? (
            <View style={styles.more}>
              <AppText variant="title2" style={styles.moreText}>
                +{extra}
              </AppText>
            </View>
          ) : null}
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP },
  more: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radii.md,
    backgroundColor: colors.imageScrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: colors.ivory },
});
