import { create } from 'zustand';

import type { Celebration, ComparisonCandidate } from '@/features/rankings/experience';

export interface RankingMoment {
  postId: string;
  title: string;
  rating: number;
  thumbUrl: string | null;
  celebration: Celebration | null;
  candidate: ComparisonCandidate | null;
}

interface RankingMomentState {
  current: RankingMoment | null;
  show: (moment: RankingMoment) => void;
  close: () => void;
}

/** What to show after publishing: a celebration and/or a comparison. */
export const useRankingMomentStore = create<RankingMomentState>((set) => ({
  current: null,
  show: (moment) => set({ current: moment.celebration || moment.candidate ? moment : null }),
  close: () => set({ current: null }),
}));
