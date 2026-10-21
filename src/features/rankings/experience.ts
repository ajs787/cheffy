import { mapProfileSummary } from '@/features/profile/mappers';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { fetchRows } from '@/lib/supabase/query';
import { signPostImagePaths } from '@/lib/supabase/storage';
import type { ProfileSummary } from '@/types/models';

export interface Placement {
  rank: number;
  total: number;
  primarySlug: string;
  primaryName: string;
  passedPostId: string | null;
  passedTitle: string | null;
}

export async function fetchPlacement(postId: string): Promise<Placement | null> {
  const row = unwrap(await supabase.rpc('ranking_placement', { p_post: postId })) as {
    rank: number;
    total: number;
    primary_slug: string;
    primary_name: string;
    passed_post_id: string | null;
    passed_title: string | null;
  } | null;
  if (!row) return null;
  return {
    rank: Number(row.rank),
    total: Number(row.total),
    primarySlug: row.primary_slug,
    primaryName: row.primary_name,
    passedPostId: row.passed_post_id,
    passedTitle: row.passed_title,
  };
}

/** Needs real history before celebrating: at least two earlier entries in the category. */
export const MIN_HISTORY = 3;

export type Celebration =
  | { kind: 'first'; headline: string; detail: string | null }
  | { kind: 'top5'; headline: string; detail: string | null };

const NOUN: Record<string, string> = { cooking: 'dish', baking: 'bake', drinks: 'drink' };

/** What (if anything) to celebrate for a new entry's placement (pure). */
export function celebrationFor(placement: Placement | null, title: string): Celebration | null {
  if (!placement || placement.total < MIN_HISTORY) return null;
  const noun = NOUN[placement.primarySlug] ?? 'creation';
  const detail = placement.passedTitle ? `${title} just passed ${placement.passedTitle}.` : null;
  if (placement.rank === 1) return { kind: 'first', headline: `Your new #1 ${noun}!`, detail };
  if (placement.rank <= 5) {
    return { kind: 'top5', headline: `#${placement.rank} of your ${placement.total} ${noun}s`, detail };
  }
  return null;
}

export interface ComparisonCandidate {
  postId: string;
  title: string;
  rating: number;
  thumbPath: string | null;
  thumbUrl: string | null;
}

export async function fetchComparisonCandidate(postId: string): Promise<ComparisonCandidate | null> {
  const rows = await fetchRows<{ post_id: string; title: string; rating: number; thumb_path: string | null }>(
    supabase.rpc('comparison_candidate', { p_post: postId }),
  );
  const row = rows[0];
  if (!row) return null;
  const urls = row.thumb_path ? await signPostImagePaths([row.thumb_path]) : {};
  return {
    postId: row.post_id,
    title: row.title,
    rating: Number(row.rating),
    thumbPath: row.thumb_path,
    thumbUrl: row.thumb_path ? (urls[row.thumb_path] ?? null) : null,
  };
}

export async function recordComparison(preferred: string, other: string, tie = false): Promise<void> {
  unwrap(await supabase.rpc('record_comparison', { p_preferred: preferred, p_other: other, p_tie: tie }));
}

/**
 * When someone prefers the creation they rated lower, the ratings and their
 * preference disagree. We never change a rating for them; we offer to.
 */
export function preferenceConflicts(preferredRating: number, otherRating: number): boolean {
  return preferredRating < otherRating;
}

export interface FriendTop {
  friend: ProfileSummary;
  items: {
    postId: string;
    title: string;
    rating: number;
    rank: number;
    primarySlug: string;
    thumbPath: string | null;
    thumbUrl: string | null;
  }[];
}

export async function fetchFriendsTop(primaryId: string | null, perFriend = 3): Promise<FriendTop[]> {
  const rows = await fetchRows<{
    user_id: string;
    username: string;
    display_name: string;
    avatar_path: string | null;
    post_id: string;
    title: string;
    rating: number;
    rank: number;
    primary_slug: string;
    thumb_path: string | null;
  }>(supabase.rpc('friends_top_creations', { p_primary_id: primaryId, p_per_friend: perFriend }));
  const urls = await signPostImagePaths(rows.flatMap((r) => (r.thumb_path ? [r.thumb_path] : [])));
  const byFriend = new Map<string, FriendTop>();
  for (const r of rows) {
    const group =
      byFriend.get(r.user_id) ??
      byFriend
        .set(r.user_id, {
          friend: mapProfileSummary({
            id: r.user_id,
            username: r.username,
            display_name: r.display_name,
            avatar_path: r.avatar_path,
          }),
          items: [],
        })
        .get(r.user_id)!;
    group.items.push({
      postId: r.post_id,
      title: r.title,
      rating: Number(r.rating),
      rank: Number(r.rank),
      primarySlug: r.primary_slug,
      thumbPath: r.thumb_path,
      thumbUrl: r.thumb_path ? (urls[r.thumb_path] ?? null) : null,
    });
  }
  // Friends with the strongest #1 first.
  return [...byFriend.values()].sort((a, b) => (b.items[0]?.rating ?? 0) - (a.items[0]?.rating ?? 0));
}

export interface SharedFavorite {
  categoryId: string;
  name: string;
  mine: { postId: string; title: string; rating: number };
  theirs: { postId: string; title: string; rating: number };
}

export async function fetchSharedFavorites(friendId: string): Promise<SharedFavorite[]> {
  const rows = await fetchRows<{
    category_id: string;
    name: string;
    my_post_id: string;
    my_title: string;
    my_rating: number;
    their_post_id: string;
    their_title: string;
    their_rating: number;
  }>(supabase.rpc('shared_favorites', { p_friend: friendId }));
  return rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name,
    mine: { postId: r.my_post_id, title: r.my_title, rating: Number(r.my_rating) },
    theirs: { postId: r.their_post_id, title: r.their_title, rating: Number(r.their_rating) },
  }));
}
