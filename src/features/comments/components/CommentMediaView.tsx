import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { openImageViewer, type ViewerImage } from '@/stores/imageViewer';
import { colors, radii } from '@/theme';
import type { CommentMedia } from '@/types/models';

import { fitWithin } from '../media';

/** Thumbnail box in a thread: photos up to 200×240, stickers up to 120×120. */
const PHOTO_BOX = { w: 200, h: 240 };
const STICKER_BOX = { w: 120, h: 120 };

export function viewerImageFor(media: CommentMedia, key: string, label: string): ViewerImage {
  return {
    key,
    uri: media.localUri ?? null,
    thumbUri: media.thumbUrl,
    storagePath: media.path ?? undefined,
    bucket: 'comment-media',
    cacheKey: media.path ?? undefined,
    thumbCacheKey: media.thumbPath ?? undefined,
    width: media.width,
    height: media.height,
    label,
  };
}

/** A comment's photo or sticker: aspect kept, list-size file only, tap to enlarge. */
function CommentMediaViewBase({
  media,
  commentId,
  label,
}: {
  media: CommentMedia;
  commentId: string;
  label: string;
}) {
  if (media.removed) {
    return (
      <AppText variant="caption" color="textTertiary" style={styles.removed}>
        Picture removed for breaking the Community Guidelines
      </AppText>
    );
  }
  const sticker = media.kind === 'sticker';
  const box = sticker ? STICKER_BOX : PHOTO_BOX;
  const size = fitWithin(media.width, media.height, box.w, box.h);
  return (
    <Pressable
      onPress={() => openImageViewer([viewerImageFor(media, `comment-${commentId}`, label)])}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      accessibilityHint="Opens it full screen"
      style={styles.wrap}
      testID={`comment-media-${commentId}`}
    >
      <View style={[size, !sticker && styles.photoFrame]}>
        {media.thumbUrl ? (
          <Image
            source={{ uri: media.thumbUrl, cacheKey: media.thumbPath ?? undefined }}
            style={StyleSheet.absoluteFill}
            contentFit={sticker ? 'contain' : 'cover'}
            cachePolicy="disk"
            recyclingKey={media.thumbPath ?? media.thumbUrl}
            transition={150}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export const CommentMediaView = memo(CommentMediaViewBase);

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', marginTop: 4 },
  photoFrame: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  removed: { marginTop: 2 },
});
