import { attachImageUrls, mapPosts, POST_SELECT, type PostRow } from '@/features/posts/mappers';
import { supabase } from '@/lib/supabase/client';
import { fetchRows } from '@/lib/supabase/query';
import type { Cursor, Page, Post } from '@/types/models';

export const FEED_PAGE_SIZE = 10;

/** Pages of the following feed (people you follow + you), newest first. */
export async function fetchFeedPage(cursor: Cursor | null): Promise<Page<Post>> {
  const rows = await fetchRows<PostRow>(
    supabase
      .rpc('feed_posts', {
        p_before: cursor?.before ?? null,
        p_before_id: cursor?.beforeId ?? null,
        p_limit: FEED_PAGE_SIZE,
      })
      .select(POST_SELECT)
      .order('published_at', { ascending: false })
      .order('id', { ascending: false }),
  );
  const posts = await attachImageUrls(mapPosts(rows), 'full');
  // Cursor comes from the raw rows so a hidden author can't stall pagination.
  const last = rows[rows.length - 1];
  return {
    items: posts,
    nextCursor:
      rows.length === FEED_PAGE_SIZE && last?.published_at ? { before: last.published_at, beforeId: last.id } : null,
  };
}
