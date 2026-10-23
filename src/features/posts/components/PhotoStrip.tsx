import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, ArrowRight, Camera, ImagePlus, MoreHorizontal, Star, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ActionSheet, AppText, FoodImage, PressableScale, type SheetAction } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { ImageViewerModal } from '@/features/media/ImageViewerHost';
import type { ViewerImage } from '@/stores/imageViewer';
import { toast } from '@/stores/toast';
import { colors, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';

import { MAX_IMAGES, type ComposeImage } from '../schemas';

export interface PhotoStripProps {
  images: ComposeImage[];
  onChange: (images: ComposeImage[]) => void;
}

const TILE_W = 104;
const TILE_H = 130;

function toComposeImages(assets: ImagePicker.ImagePickerAsset[]): ComposeImage[] {
  return assets.map((asset) => ({
    key: Crypto.randomUUID(),
    kind: 'local',
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
  }));
}

/** Pick, preview, reorder and remove up to six photos. The first is the cover. */
export function PhotoStrip({ images, onChange }: PhotoStripProps) {
  const [sourceSheet, setSourceSheet] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // Full-screen preview of every selected photo, at the best resolution we
  // have: the picked file itself, or the uploaded original (signed on demand).
  const viewerImages: ViewerImage[] = images.map((image, i) =>
    image.kind === 'local'
      ? {
          key: image.key,
          uri: image.uri,
          thumbUri: image.uri,
          width: image.width,
          height: image.height,
          label: `Photo ${i + 1}`,
        }
      : {
          key: image.key,
          uri: image.uri,
          thumbUri: null,
          storagePath: image.storagePath,
          cacheKey: image.storagePath,
          width: image.width,
          height: image.height,
          label: `Photo ${i + 1}`,
        },
  );
  const preview = (index: number) => setPreviewIndex(index);
  const remaining = MAX_IMAGES - images.length;

  const addFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
        quality: 1,
      });
      if (!result.canceled && result.assets.length > 0) {
        haptics.selection();
        onChange([...images, ...toComposeImages(result.assets.slice(0, remaining))]);
      }
    } catch {
      toast.error('Couldn’t open your photos. Check Cheffy’s Photos permission in Settings.');
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      toast.error('Allow camera access in Settings to take photos in Cheffy.');
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled && result.assets.length > 0) {
        haptics.selection();
        onChange([...images, ...toComposeImages(result.assets.slice(0, 1))]);
      }
    } catch {
      toast.error('The camera isn’t available right now.');
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    haptics.selection();
    onChange(next);
  };

  const photoActions: SheetAction[] =
    selected === null
      ? []
      : [
          ...(selected > 0
            ? [{ key: 'cover', label: 'Make cover photo', icon: Star, onPress: () => move(selected, 0) }]
            : []),
          ...(selected > 0
            ? [
                {
                  key: 'left',
                  label: 'Move earlier',
                  icon: ArrowLeft,
                  onPress: () => move(selected, selected - 1),
                },
              ]
            : []),
          ...(selected < images.length - 1
            ? [
                {
                  key: 'right',
                  label: 'Move later',
                  icon: ArrowRight,
                  onPress: () => move(selected, selected + 1),
                },
              ]
            : []),
          {
            key: 'remove',
            label: 'Remove photo',
            icon: Trash2,
            destructive: true,
            onPress: () => onChange(images.filter((_, i) => i !== selected)),
          },
        ];

  if (images.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <PressableScale
          onPress={() => setSourceSheet(true)}
          accessibilityRole="button"
          accessibilityLabel="Add photos"
          style={styles.empty}
          testID="compose-add-photos"
        >
          <ImagePlus size={iconSizes.xl} color={colors.accent} strokeWidth={strokes.regular} />
          <View style={styles.emptyText}>
            <AppText variant="bodyStrong">Add photos</AppText>
            <AppText variant="caption" color="textSecondary">
              Up to {MAX_IMAGES} · the first one is the cover
            </AppText>
          </View>
        </PressableScale>
        <SourceSheet
          visible={sourceSheet}
          onClose={() => setSourceSheet(false)}
          onLibrary={addFromLibrary}
          onCamera={takePhoto}
        />
      </View>
    );
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {images.map((image, index) => (
          <PressableScale
            key={image.key}
            onPress={() => preview(index)}
            onLongPress={() => setSelected(index)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Photo ${index + 1} of ${images.length}${index === 0 ? ', cover' : ''}`}
            accessibilityHint="Opens it full screen. Long press for options."
            accessibilityActions={[{ name: 'longpress', label: 'Photo options' }]}
            onAccessibilityAction={() => setSelected(index)}
            style={styles.tile}
          >
            <FoodImage
              uri={image.uri}
              cacheKey={image.kind === 'remote' ? image.storagePath : undefined}
              style={styles.tileImage}
              radius="md"
            />
            {/* Options live on their own button so a tap always previews. */}
            <Pressable
              onPress={() => setSelected(index)}
              hitSlop={6}
              style={styles.optionsButton}
              accessibilityRole="button"
              accessibilityLabel={`Options for photo ${index + 1}`}
            >
              <MoreHorizontal size={16} color={colors.ivory} strokeWidth={strokes.bold} />
            </Pressable>
            {index === 0 ? (
              <View style={styles.coverBadge}>
                <AppText variant="caption" color="textInverse">
                  Cover
                </AppText>
              </View>
            ) : null}
          </PressableScale>
        ))}
        {remaining > 0 ? (
          <PressableScale
            onPress={() => setSourceSheet(true)}
            accessibilityRole="button"
            accessibilityLabel="Add more photos"
            style={[styles.tile, styles.addTile]}
          >
            <ImagePlus size={iconSizes.lg} color={colors.textSecondary} strokeWidth={strokes.regular} />
            <AppText variant="caption" color="textSecondary">
              {remaining} left
            </AppText>
          </PressableScale>
        ) : null}
      </ScrollView>
      <SourceSheet
        visible={sourceSheet}
        onClose={() => setSourceSheet(false)}
        onLibrary={addFromLibrary}
        onCamera={takePhoto}
      />
      <ActionSheet visible={selected !== null} onClose={() => setSelected(null)} actions={photoActions} />
      <ImageViewerModal
        visible={previewIndex !== null}
        images={viewerImages}
        index={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
      />
    </View>
  );
}

function SourceSheet({
  visible,
  onClose,
  onLibrary,
  onCamera,
}: {
  visible: boolean;
  onClose: () => void;
  onLibrary: () => void;
  onCamera: () => void;
}) {
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      actions={[
        { key: 'library', label: 'Choose from library', icon: ImagePlus, onPress: () => void onLibrary() },
        { key: 'camera', label: 'Take a photo', icon: Camera, onPress: () => void onCamera() },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  emptyWrap: { paddingHorizontal: SCREEN_GUTTER },
  empty: {
    height: 104,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  emptyText: { flex: 1, gap: 2 },
  strip: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  tile: { width: TILE_W, height: TILE_H },
  tileImage: { width: TILE_W, height: TILE_H },
  addTile: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  optionsButton: {
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.imageScrim,
  },
  coverBadge: {
    position: 'absolute',
    left: spacing.xs + 2,
    bottom: spacing.xs + 2,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.imageScrim,
  },
});
