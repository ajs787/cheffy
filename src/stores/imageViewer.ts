import { create } from 'zustand';

import type { PostImage } from '@/types/models';

/** A photo the full-screen viewer can show. */
export interface ViewerImage {
  key: string;
  /** Full-resolution URL, when already known. */
  uri: string | null;
  /** Small version shown instantly while the full one loads. */
  thumbUri: string | null;
  /** Private post photos: signed on demand when `uri` is missing. */
  storagePath?: string;
  /** Stable disk-cache keys, shared with the feed so nothing re-downloads. */
  cacheKey?: string;
  thumbCacheKey?: string;
  width?: number;
  height?: number;
  /** What VoiceOver reads for this photo. */
  label: string;
}

interface ImageViewerState {
  images: ViewerImage[];
  index: number;
  visible: boolean;
  show: (images: ViewerImage[], index?: number) => void;
  close: () => void;
}

export const useImageViewerStore = create<ImageViewerState>((set) => ({
  images: [],
  index: 0,
  visible: false,
  show: (images, index = 0) =>
    set({
      images,
      index: Math.min(Math.max(index, 0), Math.max(images.length - 1, 0)),
      visible: images.length > 0,
    }),
  close: () => set({ visible: false }),
}));

/** Opens the full-screen viewer (mounted once at the root). */
export const openImageViewer = (images: ViewerImage[], index = 0) =>
  useImageViewerStore.getState().show(images, index);

/** A post's photos, in order, for the viewer. */
export function postImagesForViewer(images: readonly PostImage[], title: string): ViewerImage[] {
  return images.map((image, i) => ({
    key: image.id,
    uri: image.url,
    thumbUri: image.thumbUrl ?? image.url,
    storagePath: image.storagePath,
    cacheKey: image.storagePath,
    thumbCacheKey: image.thumbUrl ? image.thumbPath : image.storagePath,
    width: image.width,
    height: image.height,
    label: images.length > 1 ? `${title}, photo ${i + 1} of ${images.length}` : `${title}, photo`,
  }));
}

/** Someone's profile photo for the viewer, or null when they have none. */
export function avatarForViewer(profile: {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarOriginalUrl?: string | null;
}): ViewerImage | null {
  if (!profile.avatarUrl) return null;
  // The original framing when we have it (fit to screen, aspect preserved);
  // photos from before V3 only exist as the square.
  const original = profile.avatarOriginalUrl ?? null;
  return {
    key: `avatar-${profile.id}`,
    uri: original ?? profile.avatarUrl,
    thumbUri: profile.avatarUrl,
    width: original ? undefined : 1,
    height: original ? undefined : 1,
    label: `${profile.displayName}’s profile photo`,
  };
}
