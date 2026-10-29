// Reads an image's real type and size from its bytes (never from the file
// name or the Content-Type a client claims). Only JPEG, PNG and WebP are
// recognised; anything else (SVG, HTML, GIF, HEIC, executables…) is null.
// Pure, so the app's tests can cover it; used by the comment-media function.

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
  /** PNG colour type with alpha, or WebP with an alpha flag. */
  mayHaveAlpha: boolean;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function png(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || !sig.every((v, i) => b[i] === v)) return null;
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  const colorType = b[25]!;
  return { mime: 'image/png', width: u32be(b, 16), height: u32be(b, 20), mayHaveAlpha: colorType === 4 || colorType === 6 || colorType === 3 };
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Start-of-frame markers carry the size (not DHT/JPG/DAC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: 'image/jpeg', height: u16be(b, i + 5), width: u16be(b, i + 7), mayHaveAlpha: false };
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end / scan before any frame header
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { mime: 'image/webp', width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff, mayHaveAlpha: false };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, mayHaveAlpha: true };
  }
  if (chunk === 'VP8X') {
    const flags = b[20]!;
    // Animated WebP isn't accepted: stickers are stored as still images.
    if (flags & 0x02) return null;
    return { mime: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, mayHaveAlpha: (flags & 0x10) !== 0 };
  }
  return null;
}

export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  const info = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  if (!info || info.width < 1 || info.height < 1) return null;
  return info;
}

export const EXTENSIONS: Record<ImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const LIMITS = {
  /** Full image: longest side and bytes. */
  fullSide: 2048,
  fullBytes: 3 * 1024 * 1024,
  thumbSide: 720,
  thumbBytes: 512 * 1024,
  /** Uploads per person per hour. */
  perHour: 30,
} as const;

export type UploadKind = 'photo' | 'sticker';

/** Why a file is refused, or null when it's fine. */
export function checkImage(
  info: ImageInfo | null,
  bytes: number,
  kind: UploadKind,
  role: 'full' | 'thumb',
): string | null {
  if (!info) return 'not a JPEG, PNG or WebP image';
  const maxSide = role === 'full' ? LIMITS.fullSide : LIMITS.thumbSide;
  const maxBytes = role === 'full' ? LIMITS.fullBytes : LIMITS.thumbBytes;
  if (bytes > maxBytes) return 'file too large';
  if (Math.max(info.width, info.height) > maxSide) return 'image too large';
  // Stickers keep transparency, so they must be PNG or WebP.
  if (kind === 'sticker' && info.mime === 'image/jpeg') return 'stickers must be PNG or WebP';
  return null;
}
