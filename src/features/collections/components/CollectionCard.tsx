import { router } from 'expo-router';
import { Bookmark, Lock, Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, FoodImage, PressableScale } from '@/components/ui';
import { colors, iconSizes, radii, spacing, strokes } from '@/theme';
import type { Collection } from '@/types/models';
import { pluralize } from '@/utils/format';

export function CollectionCard({ collection, width }: { collection: Collection; width: number }) {
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/collection/[id]', params: { id: collection.id } })}
      activeScale={0.97}
      accessibilityRole="link"
      accessibilityLabel={`${collection.name}, ${pluralize(collection.itemCount, 'item')}`}
      style={{ width }}
    >
      <FoodImage uri={collection.coverUrl} cacheKey={collection.coverPath ?? undefined} style={{ width, height: width }} radius="md" />
      <View style={styles.caption}>
        <View style={styles.nameRow}>
          {collection.visibility === 'private' ? <Lock size={12} color={colors.textSecondary} strokeWidth={strokes.bold} /> : null}
          <AppText variant="calloutStrong" numberOfLines={1} style={styles.name}>
            {collection.name}
          </AppText>
        </View>
        <AppText variant="caption" color="textSecondary">
          {pluralize(collection.itemCount, 'item')}
        </AppText>
      </View>
    </PressableScale>
  );
}

/** Special tiles shown only on your own profile. */
export function SavedCard({ width }: { width: number }) {
  return (
    <PressableScale
      onPress={() => router.push('/saved')}
      activeScale={0.97}
      accessibilityRole="link"
      accessibilityLabel="Want to make — your saved posts"
      style={{ width }}
    >
      <View style={[styles.tile, styles.savedTile, { width, height: width }]}>
        <Bookmark size={iconSizes.xl} color={colors.accentStrong} strokeWidth={strokes.regular} />
      </View>
      <View style={styles.caption}>
        <AppText variant="calloutStrong">Want to make</AppText>
        <AppText variant="caption" color="textSecondary">
          Saved posts · private
        </AppText>
      </View>
    </PressableScale>
  );
}

export function NewCollectionCard({ width }: { width: number }) {
  return (
    <PressableScale
      onPress={() => router.push('/collection/edit')}
      activeScale={0.97}
      accessibilityRole="button"
      accessibilityLabel="New collection"
      style={{ width }}
    >
      <View style={[styles.tile, styles.newTile, { width, height: width }]}>
        <Plus size={iconSizes.xl} color={colors.textSecondary} strokeWidth={strokes.regular} />
      </View>
      <View style={styles.caption}>
        <AppText variant="calloutStrong">New collection</AppText>
        <AppText variant="caption" color="textSecondary">
          Best bakes, matcha, holidays…
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  caption: { paddingTop: spacing.sm, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { flexShrink: 1 },
  tile: { borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  savedTile: { backgroundColor: colors.accentSoft },
  newTile: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong },
});
