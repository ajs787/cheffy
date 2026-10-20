import type { ProfileSummary } from '@/types/models';

export interface LikedBySummary {
  /** The name shown in bold ("audfrog" or "you"), or null to show a plain count. */
  lead: string | null;
  /** Everyone else, e.g. "and 2 others". */
  others: number;
}

/**
 * "Liked by audfrog and 2 others". Prefers someone other than you as the
 * lead; falls back to "you", then to a plain count if no liker is visible.
 */
export function likedBySummary(
  likers: readonly ProfileSummary[] = [],
  likeCount: number,
  viewerHasLiked: boolean,
  viewerId: string | null,
): LikedBySummary | null {
  if (likeCount <= 0) return null;
  const other = likers.find((l) => l.id !== viewerId);
  if (other) return { lead: other.username, others: likeCount - 1 };
  if (viewerHasLiked) return { lead: 'you', others: likeCount - 1 };
  return { lead: null, others: likeCount };
}
