import type { RankingQueryParams } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { fetchRows } from '@/lib/supabase/query';
import { signPostImagePaths } from '@/lib/supabase/storage';
import type { RankingFilterOption, RankingItem } from '@/types/models';

export const RANKINGS_PAGE_SIZE = 30;

export interface RankingRow {
  rank: number;
  total_count: number;
  post_id: string;
  title: string;
  rating: number;
  made_on: string;
  created_at: string;
  primary_slug: string;
  primary_name: string;
  secondary_name: string | null;
  thumb_path: string | null;
}

/** Re-applies get_rankings' ordering (PostgREST doesn't promise to keep it). */
export function compareRankingRows(
  a: Pick<RankingRow, 'rank' | 'made_on' | 'created_at'>,
  b: Pick<RankingRow, 'rank' | 'made_on' | 'created_at'>,
  sort: RankingQueryParams['sort'],
): number {
  const byRank = Number(a.rank) - Number(b.rank);
  switch (sort) {
    case 'lowest':
      return -byRank;
    case 'recent':
      return b.made_on.localeCompare(a.made_on) || b.created_at.localeCompare(a.created_at) || byRank;
    case 'oldest':
      return a.made_on.localeCompare(b.made_on) || a.created_at.localeCompare(b.created_at) || byRank;
    default:
      return byRank;
  }
}

export async function fetchRankingsPage(
  userId: string,
  params: RankingQueryParams,
  offset: number,
): Promise<{ items: RankingItem[]; total: number; nextOffset: number | null }> {
  const rows = await fetchRows<RankingRow>(
    supabase.rpc('get_rankings', {
      p_user_id: userId,
      p_primary_id: params.primaryId,
      p_category_id: params.categoryId,
      p_tag_id: params.tagId,
      p_sort: params.sort,
      p_limit: RANKINGS_PAGE_SIZE,
      p_offset: offset,
    }),
  );
  rows.sort((a, b) => compareRankingRows(a, b, params.sort));
  const urls = await signPostImagePaths(rows.flatMap((r) => (r.thumb_path ? [r.thumb_path] : [])));
  const items = rows.map((r) => ({
    rank: Number(r.rank),
    totalCount: Number(r.total_count),
    postId: r.post_id,
    title: r.title,
    rating: Number(r.rating),
    madeOn: r.made_on,
    primarySlug: r.primary_slug,
    primaryName: r.primary_name,
    secondaryName: r.secondary_name,
    thumbPath: r.thumb_path,
    thumbUrl: r.thumb_path ? (urls[r.thumb_path] ?? null) : null,
  }));
  return {
    items,
    total: items[0]?.totalCount ?? 0,
    nextOffset: rows.length === RANKINGS_PAGE_SIZE ? offset + RANKINGS_PAGE_SIZE : null,
  };
}

export async function fetchRankingFilters(userId: string): Promise<RankingFilterOption[]> {
  const rows = await fetchRows<{
    kind: RankingFilterOption['kind'];
    id: string;
    slug: string;
    name: string;
    post_count: number;
  }>(supabase.rpc('ranking_filters', { p_user_id: userId }));
  return rows.map((r) => ({ kind: r.kind, id: r.id, slug: r.slug, name: r.name, postCount: Number(r.post_count) }));
}
