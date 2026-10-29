import { attachImageUrls, mapPosts, POST_SELECT, type PostRow } from '@/features/posts/mappers';
import type { DiscoverQueryParams } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { fetchRows } from '@/lib/supabase/query';
import type { Cursor, Post } from '@/types/models';
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
  if (sort === 'cheapest' && a.budget_cost_cents !== b.budget_cost_cents)
    return (a.budget_cost_cents ?? Infinity) - (b.budget_cost_cents ?? Infinity);
  if (sort === 'top' && a.rating !== b.rating) return Number(b.rating ?? -1) - Number(a.rating ?? -1);
  if (sort === 'loved' && a.like_count !== b.like_count) return b.like_count - a.like_count;
  return (b.published_at ?? '').localeCompare(a.published_at ?? '') || b.id.localeCompare(a.id);
}

export async function fetchDiscoverPage(
  params: DiscoverQueryParams,
  pageParam: DiscoverPageParam,
  limit = DISCOVER_PAGE_SIZE,
): Promise<DiscoverPage> {
  const since =
    params.sinceDays != null ? new Date(Date.now() - params.sinceDays * 86_400_000).toISOString() : null;
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
        p_budget: params.budget ?? false,
        p_max_cost_cents: params.maxCostCents ?? null,
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

/**
 * The week's lowest self-rated public creations. The database decides who's
 * eligible and returns nothing until there are enough to make a section.
 */
export async function fetchMostHated(): Promise<Post[]> {
  const rows = await fetchRows<PostRow>(supabase.rpc('most_hated_posts').select(POST_SELECT));
  // Re-apply the RPC's order: lowest first, newest first on ties, then id.
  rows.sort(
    (a, b) =>
      Number(a.rating) - Number(b.rating) ||
      (b.published_at ?? '').localeCompare(a.published_at ?? '') ||
      a.id.localeCompare(b.id),
  );
  return attachImageUrls(mapPosts(rows), 'thumb');
}

export interface TrendingItem {
  kind: 'subcategory' | 'cuisine' | 'tag';
  id: string;
  slug: string;
  name: string;
  postCount: number;
}

export async function fetchTrending(): Promise<TrendingItem[]> {
  const rows = await fetchRows<{
    kind: TrendingItem['kind'];
    id: string;
    slug: string;
    name: string;
    post_count: number;
  }>(supabase.rpc('trending_taxonomy', { p_min_posts: 2, p_limit: 6 }));
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    slug: r.slug,
    name: r.name,
    postCount: Number(r.post_count),
  }));
}

export interface SearchPage {
  items: Post[];
  nextOffset: number | null;
}

/**
 * Creation search, most relevant first (exact title, then title starts with
 * the query, …, then tag and category matches; newest first within each).
 * Two requests per page: ranked ids, then those posts.
 */
export async function searchPosts(query: string, offset: number): Promise<SearchPage> {
  const q = sanitizeSearch(query);
  if (q.length < 2) return { items: [], nextOffset: null };
  const picks = await fetchRows<{ post_id: string; tier: number }>(
    supabase.rpc('search_creations', { p_query: q, p_offset: offset, p_limit: DISCOVER_PAGE_SIZE }),
  );
  if (picks.length === 0) return { items: [], nextOffset: null };
  const rows = await fetchRows<PostRow>(
    supabase
      .from('posts')
      .select(POST_SELECT)
      .in(
        'id',
        picks.map((p) => p.post_id),
      ),
  );
  const order = new Map(picks.map((p, i) => [p.post_id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const items = await attachImageUrls(mapPosts(rows), 'thumb');
  return { items, nextOffset: picks.length === DISCOVER_PAGE_SIZE ? offset + DISCOVER_PAGE_SIZE : null };
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

// ---------------------------------------------------------------------------
// For Your Taste
// ---------------------------------------------------------------------------
export interface TasteTopic {
  kind: 'tag' | 'cuisine' | 'subcategory' | 'budget';
  /** Null for Budget Eats (a flag on posts, not a taxonomy row). */
  id: string | null;
  slug: string;
  name: string;
  /** Other people's posts the viewer can browse under this topic. */
  postCount: number;
  /** True when it comes from what the viewer makes, likes or saves. */
  personal: boolean;
}

/** Tags, cuisines and dish types to explore, the viewer's own interests first. */
export async function fetchTasteTopics(limit = 14): Promise<TasteTopic[]> {
  const rows = await fetchRows<{
    kind: TasteTopic['kind'];
    id: string | null;
    slug: string;
    name: string;
    post_count: number | string;
    personal: boolean;
  }>(supabase.rpc('taste_topics', { p_limit: limit }));
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    slug: r.slug,
    name: r.name,
    postCount: Number(r.post_count),
    personal: r.personal,
  }));
}

/** Browse params (and title) that show exactly the posts a topic counts. */
export function topicBrowseParams(topic: TasteTopic): Record<string, string> {
  if (topic.kind === 'budget') return { budget: '1', title: 'Budget Eats' };
  if (topic.kind === 'tag') return { tagId: topic.id ?? '', title: `#${topic.name}` };
  return { categoryId: topic.id ?? '', title: topic.name };
}

export const TASTE_PAGE = 18;

export interface TastePage {
  items: Post[];
  nextOffset: number | null;
}

/**
 * Creations picked for the viewer. Two requests per page: the ranked ids,
 * then those posts (with their images signed in one batch).
 */
export async function fetchTastePosts(offset: number, limit = TASTE_PAGE): Promise<TastePage> {
  const picks = await fetchRows<{ post_id: string; score: number }>(
    supabase.rpc('taste_posts', { p_limit: limit, p_offset: offset }),
  );
  if (picks.length === 0) return { items: [], nextOffset: null };
  const rows = await fetchRows<PostRow>(
    supabase
      .from('posts')
      .select(POST_SELECT)
      .in(
        'id',
        picks.map((p) => p.post_id),
      ),
  );
  const order = new Map(picks.map((p, i) => [p.post_id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const items = await attachImageUrls(mapPosts(rows), 'thumb');
  return { items, nextOffset: picks.length === limit ? offset + limit : null };
}

// ---------------------------------------------------------------------------
// Search suggestions (the Search screen before anything is typed)
// ---------------------------------------------------------------------------
export const SUGGESTION_PAGE = 18;

/** Loads posts by id, keeping the ranked order, with thumbnails signed in one batch. */
async function fetchPostsInOrder(ids: string[]): Promise<Post[]> {
  if (ids.length === 0) return [];
  const rows = await fetchRows<PostRow>(supabase.from('posts').select(POST_SELECT).in('id', ids));
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return attachImageUrls(mapPosts(rows), 'thumb');
}

export interface PostPage {
  items: Post[];
  nextOffset: number | null;
}

async function fetchRankedPage(
  fn: 'trending_creations' | 'newly_cooked',
  offset: number,
  limit: number,
): Promise<PostPage> {
  const picks = await fetchRows<{ post_id: string }>(supabase.rpc(fn, { p_limit: limit, p_offset: offset }));
  const items = await fetchPostsInOrder(picks.map((p) => p.post_id));
  return { items, nextOffset: picks.length === limit ? offset + limit : null };
}

/** Public creations ranked by likes and comments in the last two weeks. */
export function fetchTrendingCreations(offset: number, limit = SUGGESTION_PAGE): Promise<PostPage> {
  return fetchRankedPage('trending_creations', offset, limit);
}

/** Recent creations from discoverable cooks, each cook's newest first. */
export function fetchNewlyCooked(offset: number, limit = SUGGESTION_PAGE): Promise<PostPage> {
  return fetchRankedPage('newly_cooked', offset, limit);
}

export interface SuggestedTag extends TagResult {
  /** Other people's posts the viewer can browse with this tag. */
  postCount: number;
  /** True when it comes from what the viewer makes, likes, saves or follows. */
  personal: boolean;
}

export interface TagSuggestions {
  suggested: SuggestedTag[];
  popular: SuggestedTag[];
  explore: SuggestedTag[];
}

/** Three lists for the Tags tab; the database keeps each tag in one list only. */
export async function fetchTagSuggestions(): Promise<TagSuggestions> {
  const rows = await fetchRows<{
    section: keyof TagSuggestions;
    id: string;
    slug: string;
    name: string;
    post_count: number | string;
    personal: boolean;
  }>(supabase.rpc('tag_suggestions', { p_suggested: 8, p_popular: 12, p_explore: 6 }));
  const result: TagSuggestions = { suggested: [], popular: [], explore: [] };
  for (const r of rows) {
    result[r.section]?.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      postCount: Number(r.post_count),
      personal: r.personal,
    });
  }
  return result;
}
