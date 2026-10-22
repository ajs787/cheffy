import { File } from 'expo-file-system';

import { supabase } from './client';

export const BUCKETS = {
  avatars: 'avatars',
  postImages: 'post-images',
} as const;

type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

const SIGNED_URL_TTL_SECONDS = 2 * 60 * 60;
/** Re-sign when a cached URL has less than this left. */
const REFRESH_MARGIN_MS = 15 * 60 * 1000;

const MAX_CACHED_URLS = 600;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Keeps the cache bounded: drop expiring entries, then the oldest (Map keeps insertion order). */
function pruneSignedUrlCache(now: number): void {
  if (signedUrlCache.size <= MAX_CACHED_URLS) return;
  for (const [path, entry] of signedUrlCache) {
    if (entry.expiresAt - now <= REFRESH_MARGIN_MS) signedUrlCache.delete(path);
  }
  for (const path of signedUrlCache.keys()) {
    if (signedUrlCache.size <= MAX_CACHED_URLS) break;
    signedUrlCache.delete(path);
  }
}

/**
 * Signs private post-image paths in one batch request. URLs are cached in
 * memory until close to expiry so lists don't re-sign on every render; the
 * image disk cache is keyed by path (see FoodImage) so re-signing never
 * re-downloads.
 */
export async function signPostImagePaths(paths: readonly string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const missing: string[] = [];

  for (const path of new Set(paths)) {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt - now > REFRESH_MARGIN_MS) {
      result[path] = cached.url;
    } else {
      missing.push(path);
    }
  }

  if (missing.length > 0) {
    const { data, error } = await supabase.storage
      .from(BUCKETS.postImages)
      .createSignedUrls(missing, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    const expiresAt = now + SIGNED_URL_TTL_SECONDS * 1000;
    for (const entry of data) {
      if (entry.path && entry.signedUrl && !entry.error) {
        signedUrlCache.set(entry.path, { url: entry.signedUrl, expiresAt });
        result[entry.path] = entry.signedUrl;
      }
    }
    pruneSignedUrlCache(now);
  }

  return result;
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKETS.avatars).getPublicUrl(path).data.publicUrl;
}

export async function uploadImageFile(bucket: Bucket, path: string, localUri: string): Promise<void> {
  const body = await new File(localUri).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  // Paths are fresh UUIDs, so "already exists" means an earlier attempt of
  // this same upload landed even though its response was lost: success.
  if (error && !isAlreadyExists(error)) throw error;
}

function isAlreadyExists(error: { message?: string; statusCode?: string | number }): boolean {
  return String(error.statusCode) === '409' || /already exists|duplicate/i.test(error.message ?? '');
}

export async function removeFiles(bucket: Bucket, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove([...paths]);
  if (error) throw error;
}

