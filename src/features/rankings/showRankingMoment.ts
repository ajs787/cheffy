import { useRankingMomentStore } from '@/stores/rankingMoment';

import { celebrationFor, fetchComparisonCandidate, fetchPlacement } from './experience';

/**
 * After publishing: works out where the entry landed and whether there's a
 * fair comparison to offer, then shows the moment. Returns whether anything
 * was shown. Failures are silent — this is a delight, not a requirement.
 */
export async function showRankingMoment(postId: string, title: string, rating: number): Promise<boolean> {
  try {
    const [placement, candidate] = await Promise.all([
      fetchPlacement(postId),
      fetchComparisonCandidate(postId),
    ]);
    const celebration = celebrationFor(placement, title);
    if (!celebration && !candidate) return false;
    useRankingMomentStore.getState().show({ postId, title, rating, thumbUrl: null, celebration, candidate });
    return true;
  } catch {
    return false;
  }
}
