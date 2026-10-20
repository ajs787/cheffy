import { attachImageUrls, FEED_POST_SELECT, mapPosts, withRecentLikers, type PostRow } from '@/features/posts/mappers';
import { supabase } from '@/lib/supabase/client';
import { fetchRows } from '@/lib/supabase/query';
import type { Cursor, Page, Post } from '@/types/models';

export const FEED_PAGE_SIZE = 10;

export type FeedMode = 'following' | 'forYou';

async function toPage(rows: PostRow[]): Promise<Page<Post>> {
  const posts = await attachImageUrls(mapPosts(rows), 'card');
  // Cursor comes from the raw rows so a hidden author can't stall pagination.
  const last = rows[rows.length - 1];
  return {
    items: posts,
    nextCursor:
      rows.length === FEED_PAGE_SIZE && last?.published_at ? { before: last.published_at, beforeId: last.id } : null,
  };
}

/** Following: people you follow (and you), newest first. */
export async function fetchFollowingPage(cursor: Cursor | null): Promise<Page<Post>> {
  const rows = await fetchRows<PostRow>(
    withRecentLikers(
      supabase
        .rpc('feed_posts', {
          p_before: cursor?.before ?? null,
          p_before_id: cursor?.beforeId ?? null,
          p_limit: FEED_PAGE_SIZE,
        })
        .select(FEED_POST_SELECT)
        .order('published_at', { ascending: false })
        .order('id', { ascending: false }),
    ),
  );
  return toPage(rows);
}

/**
 * For You: everything recently published that you're allowed to see, from
 * everyone but you. Honest "latest from the community" — no invented ranking.
 */
export async function fetchForYouPage(cursor: Cursor | null): Promise<Page<Post>> {
  const rows = await fetchRows<PostRow>(
    withRecentLikers(
      supabase
        .rpc('discover_posts', {
          p_sort: 'recent',
          p_before: cursor?.before ?? null,
          p_before_id: cursor?.beforeId ?? null,
          p_limit: FEED_PAGE_SIZE,
        })
        .select(FEED_POST_SELECT)
        .order('published_at', { ascending: false })
        .order('id', { ascending: false }),
    ),
  );
  return toPage(rows);
}
