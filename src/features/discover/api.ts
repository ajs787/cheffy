import { attachImageUrls, mapPosts, POST_SELECT, type PostRow } from '@/features/posts/mappers';
import type { DiscoverQueryParams } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { fetchRows } from '@/lib/supabase/query';
import type { Cursor, Page, Post } from '@/types/models';
import { sanitizeSearch } from '@/utils/search';

export const DISCOVER_PAGE_SIZE = 18;

/** Page token: a keyset cursor for 'recent', an offset for ranked sorts. */
export type DiscoverPageParam = Cursor | { offset: number } | null;

export interface DiscoverPage {
  items: Post[];
  nextPageParam: DiscoverPageParam;
}

/** Re-applies the RPC's ordering (PostgREST doesn't promise to keep it). */
export function compareDiscoverRows(a: PostRow, b: PostRow, sort: DiscoverQueryParams['sort']): number {
  if (sort === 'top' && a.rating !== b.rating) return Number(b.rating ?? -1) - Number(a.rating ?? -1);
  if (sort === 'loved' && a.like_count !== b.like_count) return b.like_count - a.like_count;
  return (b.published_at ?? '').localeCompare(a.published_at ?? '') || b.id.localeCompare(a.id);
}

export async function fetchDiscoverPage(
  params: DiscoverQueryParams,
  pageParam: DiscoverPageParam,
  limit = DISCOVER_PAGE_SIZE,
): Promise<DiscoverPage> {
  const since = params.sinceDays != null ? new Date(Date.now() - params.sinceDays * 86_400_000).toISOString() : null;
  const cursor = pageParam && 'before' in pageParam ? pageParam : null;
  const offset = pageParam && 'offset' in pageParam ? pageParam.offset : 0;

  const rows = await fetchRows<PostRow>(
    supabase
      .rpc('discover_posts', {
        p_sort: params.sort,
        p_primary_id: params.primaryId ?? null,
        p_category_id: params.categoryId ?? null,
        p_tag_id: params.tagId ?? null,
        p_following_only: params.followingOnly ?? false,
        p_since: since,
        p_before: cursor?.before ?? null,
        p_before_id: cursor?.beforeId ?? null,
        p_offset: offset,
        p_limit: limit,
      })
      .select(POST_SELECT),
  );
  rows.sort((a, b) => compareDiscoverRows(a, b, params.sort));

  const posts = await attachImageUrls(mapPosts(rows), 'thumb');
  const last = rows[rows.length - 1];
  let nextPageParam: DiscoverPageParam = null;
  if (rows.length === limit && last) {
    nextPageParam =
      params.sort === 'recent' && last.published_at
        ? { before: last.published_at, beforeId: last.id }
        : { offset: offset + limit };
  }
  return { items: posts, nextPageParam };
}

export interface TrendingItem {
  kind: 'subcategory' | 'cuisine' | 'tag';
  id: string;
  slug: string;
  name: string;
  postCount: number;
}

export async function fetchTrending(): Promise<TrendingItem[]> {
  const rows = await fetchRows<{ kind: TrendingItem['kind']; id: string; slug: string; name: string; post_count: number }>(
    supabase.rpc('trending_taxonomy', { p_min_posts: 2, p_limit: 6 }),
  );
  return rows.map((r) => ({ kind: r.kind, id: r.id, slug: r.slug, name: r.name, postCount: Number(r.post_count) }));
}

export async function searchPosts(query: string, cursor: Cursor | null): Promise<Page<Post>> {
  const q = sanitizeSearch(query);
  if (q.length < 2) return { items: [], nextCursor: null };
  const rows = await fetchRows<PostRow>(
    supabase
      .rpc('search_posts', {
        p_query: q,
        p_before: cursor?.before ?? null,
        p_before_id: cursor?.beforeId ?? null,
        p_limit: DISCOVER_PAGE_SIZE,
      })
      .select(POST_SELECT)
      .order('published_at', { ascending: false })
      .order('id', { ascending: false }),
  );
  const posts = await attachImageUrls(mapPosts(rows), 'thumb');
  const last = rows[rows.length - 1];
  return {
    items: posts,
    nextCursor:
      rows.length === DISCOVER_PAGE_SIZE && last?.published_at ? { before: last.published_at, beforeId: last.id } : null,
  };
}

export interface TagResult {
  id: string;
  slug: string;
  name: string;
}

export async function searchTags(query: string): Promise<TagResult[]> {
  const q = sanitizeSearch(query).replace(/\s+/g, ' ');
  if (q.length < 1) return [];
  return fetchRows<TagResult>(
    supabase.from('tags').select('id, slug, name').ilike('name', `${q}%`).order('name').limit(12),
  );
}
