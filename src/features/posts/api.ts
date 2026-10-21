import { supabase } from '@/lib/supabase/client';
import { fetchMaybe, fetchRows } from '@/lib/supabase/query';
import { BUCKETS, removeFiles } from '@/lib/supabase/storage';
import type { Cursor, Page, Post } from '@/types/models';

import { attachImageUrls, mapPost, mapPosts, POST_SELECT, type PostRow } from './mappers';

export const PAGE_SIZE = 18;

/** One post with full-size images. Null when deleted or not visible to the viewer. */
export async function fetchPost(postId: string): Promise<Post | null> {
  const row = await fetchMaybe<PostRow>(
    supabase.from('posts').select(POST_SELECT).eq('id', postId).maybeSingle(),
  );
  const post = row ? mapPost(row) : null;
  if (!post) return null;
  const [withUrls] = await attachImageUrls([post], 'full');
  return withUrls ?? null;
}

/** A user's diary: published posts by date made (newest first), cover thumbnails only. */
export async function fetchDiaryPage(
  userId: string,
  primaryId: string | null,
  cursor: Cursor | null,
): Promise<Page<Post>> {
  // What they created plus accepted collaborations (diary_posts).
  const rows = await fetchRows<PostRow>(
    supabase
      .rpc('diary_posts', {
        p_user_id: userId,
        p_primary_id: primaryId,
        p_before: cursor?.before ?? null,
        p_before_id: cursor?.beforeId ?? null,
        p_limit: PAGE_SIZE,
      })
      .select(POST_SELECT)
      .order('made_on', { ascending: false })
      .order('id', { ascending: false }),
  );
  const posts = await attachImageUrls(mapPosts(rows), 'thumb');
  const last = rows[rows.length - 1];
  return {
    items: posts,
    nextCursor: rows.length === PAGE_SIZE && last ? { before: last.made_on, beforeId: last.id } : null,
  };
}

export async function fetchDrafts(userId: string): Promise<Post[]> {
  const rows = await fetchRows<PostRow>(
    supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('author_id', userId)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(50),
  );
  return attachImageUrls(mapPosts(rows), 'thumb');
}

/** Deletes the post (cascades to images, likes, comments…) then its files. */
export async function deletePost(post: Pick<Post, 'id' | 'images'>): Promise<void> {
  const deleted = await fetchRows<{ id: string }>(
    supabase.from('posts').delete().eq('id', post.id).select('id'),
  );
  if (deleted.length === 0) throw new Error('post not found');
  const paths = post.images.flatMap((image) => [image.storagePath, image.thumbPath]);
  await removeFiles(BUCKETS.postImages, paths).catch(() => undefined);
}
