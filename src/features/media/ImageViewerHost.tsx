import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, IconButton } from '@/components/ui';
import { signPostImagePaths } from '@/lib/supabase/storage';
import { useImageViewerStore, type ViewerImage } from '@/stores/imageViewer';
import { colors, spacing } from '@/theme';

import { ZoomableImage } from './ZoomableImage';

/** Mount once at the root; open with `openImageViewer(images, index)`. */
export function ImageViewerHost() {
  const visible = useImageViewerStore((s) => s.visible);
  const images = useImageViewerStore((s) => s.images);
  const index = useImageViewerStore((s) => s.index);
  const close = useImageViewerStore((s) => s.close);
  return <ImageViewerModal visible={visible} images={images} index={index} onClose={close} />;
}

/**
 * The full-screen viewer as a component. Screens that are themselves modals
 * (the entry form) mount their own so iOS presents it from the top-most
 * screen rather than from the root, which is already presenting.
 */
export function ImageViewerModal({
  visible,
  images,
  index,
  onClose: close,
}: {
  visible: boolean;
  images: ViewerImage[];
  index: number;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait']}
      onRequestClose={close}
    >
      {/* Gestures inside a Modal need their own root on iOS. */}
      <GestureHandlerRootView style={styles.flex}>
        {visible ? (
          <Viewer
            key={images.map((i) => i.key).join()}
            images={images}
            initialIndex={index}
            onClose={close}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Viewer({
  images,
  initialIndex,
  onClose,
}: {
  images: ViewerImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const dismissY = useSharedValue(0);

  // Feed posts carry only the cover at full size; sign the rest on open.
  const missing = images.flatMap((image) => (!image.uri && image.storagePath ? [image.storagePath] : []));
  const signed = useQuery({
    queryKey: ['viewer-urls', ...missing],
    queryFn: () => signPostImagePaths(missing),
    enabled: missing.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  // Full size when known; until then the page shows its thumbnail placeholder.
  const uriFor = (image: ViewerImage): string | null =>
    image.uri ?? (image.storagePath ? (signed.data?.[image.storagePath] ?? null) : null);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dismissY.get()), [0, 320], [1, 0.25], 'clamp'),
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dismissY.get()), [0, 80], [1, 0], 'clamp'),
  }));

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  return (
    <View style={styles.flex}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <FlatList
        data={images}
        keyExtractor={(image) => image.key}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScroll={onScroll}
        scrollEventThrottle={32}
        renderItem={({ item, index: i }) => (
          <ZoomableImage
            image={item}
            uri={uriFor(item)}
            width={width}
            height={height}
            active={i === page}
            dismissY={dismissY}
            onZoomChange={setZoomed}
            onDismiss={onClose}
          />
        )}
      />
      <Animated.View
        style={[styles.chrome, { top: insets.top + spacing.xs }, chromeStyle]}
        pointerEvents="box-none"
      >
        {images.length > 1 ? (
          <AppText variant="calloutStrong" style={styles.counter} accessibilityLiveRegion="polite">
            {page + 1} / {images.length}
          </AppText>
        ) : (
          <View />
        )}
        <IconButton icon={X} label="Close photo" color={colors.ivory} onPress={onClose} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { backgroundColor: '#000' },
  chrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
  },
  counter: { color: colors.ivory },
});
