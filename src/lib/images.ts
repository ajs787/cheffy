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

export async function prepareAvatar(uri: string): Promise<PreparedImage> {
  // Picker already crops avatars square; just bound the size.
  return resizeJpeg(uri, Number.MAX_SAFE_INTEGER, AVATAR_WIDTH, 0.8);
}
