import * as Crypto from 'expo-crypto';

import { unwrap } from '@/lib/errors';
import { preparePostImage } from '@/lib/images';
import { supabase } from '@/lib/supabase/client';
import { BUCKETS, removeFiles, uploadImageFile } from '@/lib/supabase/storage';
import type { Taxonomy } from '@/types/models';

import { toSavePayload, type ComposeImage, type PostFormValues } from './schemas';

export interface UploadedImage {
  id: string;
  storage_path: string;
  thumb_path: string;
  width: number;
  height: number;
}

export interface SaveProgress {
  /** Images finished so far. */
  done: number;
  /** Images that need uploading in this save. */
  total: number;
  stage: 'uploading' | 'saving';
}

export interface SavePostArgs {
  userId: string;
  postId: string;
  values: PostFormValues;
  status: 'draft' | 'published';
  taxonomy: Taxonomy;
  /** Images the post had before editing (to clean up removed ones). */
  previousImages?: { storagePath: string; thumbPath: string }[];
  /**
   * Uploads that already succeeded, keyed by ComposeImage.key. Persist this
   * across retries so a failed save never re-uploads (or orphans) photos.
   */
  uploadCache: Map<string, UploadedImage>;
  onProgress?: (progress: SaveProgress) => void;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function uploadComposeImage(
  userId: string,
  postId: string,
  image: Extract<ComposeImage, { kind: 'local' }>,
): Promise<UploadedImage> {
  const { full, thumb } = await preparePostImage(image.uri, image.width);
  const id = Crypto.randomUUID();
  const storagePath = `${userId}/${postId}/${id}.jpg`;
  const thumbPath = `${userId}/${postId}/${id}_thumb.jpg`;
  await withRetry(() => uploadImageFile(BUCKETS.postImages, storagePath, full.uri));
  await withRetry(() => uploadImageFile(BUCKETS.postImages, thumbPath, thumb.uri));
  return { id, storage_path: storagePath, thumb_path: thumbPath, width: full.width, height: full.height };
}

/**
 * Saves a post end to end:
 * 1. resize + upload new photos (retrying each, reporting progress)
 * 2. write post, image order and tags in one transaction (save_post RPC)
 * 3. remove photos that were deleted during an edit
 */
export async function savePost({
  userId,
  postId,
  values,
  status,
  taxonomy,
  previousImages = [],
  uploadCache,
  onProgress,
}: SavePostArgs): Promise<string> {
  const pending = values.images.filter(
    (image): image is Extract<ComposeImage, { kind: 'local' }> =>
      image.kind === 'local' && !uploadCache.has(image.key),
  );
  const total = pending.length;
  onProgress?.({ done: 0, total, stage: total > 0 ? 'uploading' : 'saving' });

  for (const [index, image] of pending.entries()) {
    uploadCache.set(image.key, await uploadComposeImage(userId, postId, image));
    onProgress?.({ done: index + 1, total, stage: 'uploading' });
  }

  const images: UploadedImage[] = values.images.map((image) => {
    if (image.kind === 'remote') {
      return {
        id: image.id,
        storage_path: image.storagePath,
        thumb_path: image.thumbPath,
        width: image.width,
        height: image.height,
      };
    }
    const uploaded = uploadCache.get(image.key);
    if (!uploaded) throw new Error('Photo upload missing');
    return uploaded;
  });

  onProgress?.({ done: total, total, stage: 'saving' });
  const payload = toSavePayload(values, postId, status, taxonomy);
  unwrap(
    await supabase.rpc('save_post', {
      p_post: payload.p_post,
      p_images: images,
      p_tags: payload.p_tags,
      p_categories: payload.p_categories,
    }),
  );

  const kept = new Set(images.flatMap((image) => [image.storage_path, image.thumb_path]));
  const removed = previousImages
    .flatMap((image) => [image.storagePath, image.thumbPath])
    .filter((path) => !kept.has(path));
  await removeFiles(BUCKETS.postImages, removed).catch(() => undefined);

  return postId;
}
