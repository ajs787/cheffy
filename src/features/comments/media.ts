import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase/client';
import type { CommentMediaKind } from '@/types/models';

/** A picked photo or sticker, kept on the phone until the comment is sent. */
export interface DraftMedia {
  kind: CommentMediaKind;
  uri: string;
  width: number;
  height: number;
}

interface Rendered {
  uri: string;
  width: number;
  height: number;
}

/**
 * Upload sizes. Photos are re-encoded as JPEG (which also strips EXIF such as
 * location); stickers stay PNG so their transparency survives. Lists only
 * ever load the thumb.
 */
export const MEDIA_SIZES = {
  photo: { full: 1600, thumb: 480, format: SaveFormat.JPEG, mime: 'image/jpeg', ext: 'jpg' },
  sticker: { full: 512, thumb: 256, format: SaveFormat.PNG, mime: 'image/png', ext: 'png' },
} as const;

/** The box an image fits into in a thread (aspect kept, never upscaled). */
export function fitWithin(width: number, height: number, maxW: number, maxH: number) {
  if (width <= 0 || height <= 0) return { width: maxW, height: maxW };
  const scale = Math.min(maxW / width, maxH / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function render(
  uri: string,
  longSide: number,
  kind: CommentMediaKind,
  compress: number,
): Promise<Rendered> {
  const context = ImageManipulator.manipulate(uri);
  const source = await context.renderAsync();
  if (Math.max(source.width, source.height) > longSide) {
    context.resize(source.width >= source.height ? { width: longSide } : { height: longSide });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: MEDIA_SIZES[kind].format, compress });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Resized full + thumb files ready to upload. */
export async function prepareMedia(draft: DraftMedia): Promise<{ full: Rendered; thumb: Rendered }> {
  const size = MEDIA_SIZES[draft.kind];
  const full = await render(draft.uri, size.full, draft.kind, 0.8);
  const thumb = await render(full.uri, size.thumb, draft.kind, 0.7);
  return { full, thumb };
}

export class MediaUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MediaUploadError';
  }
}

/**
 * Sends the files to the comment-media Edge Function, which checks the real
 * bytes and stores them. The id is chosen here so a retry after a lost
 * response returns the same upload instead of making a second one.
 */
export async function uploadMedia(id: string, draft: DraftMedia): Promise<{ id: string }> {
  const { full, thumb } = await prepareMedia(draft);
  const size = MEDIA_SIZES[draft.kind];
  const form = new FormData();
  form.append('id', id);
  form.append('kind', draft.kind);
  // React Native's FormData streams files from disk by uri.
  form.append('full', { uri: full.uri, name: `full.${size.ext}`, type: size.mime } as unknown as Blob);
  form.append('thumb', { uri: thumb.uri, name: `thumb.${size.ext}`, type: size.mime } as unknown as Blob);

  const { data, error } = await supabase.functions.invoke<{ id: string }>('comment-media', { body: form });
  if (error) {
    const context = (error as { context?: Response }).context;
    let message = error.message;
    let status = 0;
    if (context && typeof context.json === 'function') {
      status = context.status;
      try {
        message = ((await context.json()) as { error?: string }).error ?? message;
      } catch {
        // Not JSON: keep the generic message.
      }
    }
    throw status ? new MediaUploadError(message, status) : error;
  }
  if (!data?.id) throw new MediaUploadError('upload failed', 500);
  return data;
}

export const newUploadId = () => Crypto.randomUUID();

/**
 * An image or sticker on the clipboard (e.g. "Copy" on a sticker, or
 * "Copy Subject" in Photos), saved as a PNG so transparency survives.
 * Reading the clipboard only happens when the person taps Paste.
 */
export async function imageFromClipboard(): Promise<DraftMedia | null> {
  if (!(await Clipboard.hasImageAsync())) return null;
  const image = await Clipboard.getImageAsync({ format: 'png' });
  if (!image?.data) return null;
  const base64 = image.data.replace(/^data:image\/\w+;base64,/, '');
  const file = new File(Paths.cache, `paste-${Crypto.randomUUID()}.png`);
  await file.write(base64, { encoding: 'base64' });
  return { kind: 'sticker', uri: file.uri, width: image.size.width, height: image.size.height };
}

/**
 * Something pasted or inserted from the keyboard (expo-paste-input gives a
 * temporary file). PNG/WebP/GIF/HEIC files may be stickers with
 * transparency; JPEGs are treated as photos.
 */
export async function draftFromInsertedFile(uri: string): Promise<DraftMedia> {
  const rendered = await ImageManipulator.manipulate(uri).renderAsync();
  const kind: CommentMediaKind = /\.jpe?g$/i.test(uri) ? 'photo' : 'sticker';
  return { kind, uri, width: rendered.width, height: rendered.height };
}
