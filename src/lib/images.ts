import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
}

export const FULL_IMAGE_WIDTH = 1440;
export const THUMB_IMAGE_WIDTH = 480;
const AVATAR_WIDTH = 512;

/**
 * Resizes (never upscales) and re-encodes as JPEG. Re-encoding also strips
 * EXIF metadata such as GPS location from what we upload.
 */
async function resizeJpeg(uri: string, sourceWidth: number, targetWidth: number, compress: number) {
  const context = ImageManipulator.manipulate(uri);
  if (sourceWidth > targetWidth) {
    context.resize({ width: targetWidth });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ compress, format: SaveFormat.JPEG });
  return { uri: result.uri, width: result.width, height: result.height };
}

export async function preparePostImage(
  uri: string,
  width: number,
): Promise<{ full: PreparedImage; thumb: PreparedImage }> {
  const full = await resizeJpeg(uri, width, FULL_IMAGE_WIDTH, 0.8);
  const thumb = await resizeJpeg(full.uri, full.width, THUMB_IMAGE_WIDTH, 0.7);
  return { full, thumb };
}

/** The largest centered square inside a width × height image (pure). */
export function centerSquare(width: number, height: number) {
  const size = Math.min(width, height);
  return {
    originX: Math.round((width - size) / 2),
    originY: Math.round((height - size) / 2),
    width: size,
    height: size,
  };
}

/**
 * A profile photo as two files: a centered square for the circle, and the
 * original framing (long side ≤ 1440) for viewing it enlarged.
 */
export async function prepareAvatar(
  uri: string,
): Promise<{ square: PreparedImage; original: PreparedImage }> {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const { width, height } = source;
  const original = await resizeJpeg(uri, Math.max(width, height), FULL_IMAGE_WIDTH, 0.82);

  const context = ImageManipulator.manipulate(uri).crop(centerSquare(width, height));
  if (Math.min(width, height) > AVATAR_WIDTH) context.resize({ width: AVATAR_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { square: { uri: saved.uri, width: saved.width, height: saved.height }, original };
}
