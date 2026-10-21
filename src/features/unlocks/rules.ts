import type { Recap, Unlock, UnlockState } from './api';

export interface UnlockInfo {
  id: Unlock;
  title: string;
  description: string;
  /** e.g. "2 of 3 creations" — null once unlocked. */
  progress: (state: UnlockState) => string | null;
}

const of = (have: number, need: number, noun: string) => `${Math.min(have, need)} of ${need} ${noun}`;

/** The four unlocks, in the order shown. */
export const UNLOCKS: UnlockInfo[] = [
  {
    id: 'theme_saffron',
    title: 'Saffron theme',
    description: 'A warm gold accent for your profile.',
    progress: (s) => (s.unlocked.includes('theme_saffron') ? null : of(s.creations, 3, 'creations')),
  },
  {
    id: 'frame_host',
    title: 'Host’s frame',
    description: 'A double ring around your photo, for bringing friends to the table.',
    progress: (s) =>
      s.unlocked.includes('frame_host') ? null : of(s.referrals, 2, 'friends joined with your code'),
  },
  {
    id: 'made_together',
    title: 'Made Together',
    description: 'A quiet mark on your profile once you’ve co-created something.',
    progress: (s) => (s.unlocked.includes('made_together') ? null : 'Co-post a creation with a friend'),
  },
  {
    id: 'recap',
    title: 'Your cooking recap',
    description: 'A look back at what you’ve made, from your own entries.',
    progress: (s) => (s.unlocked.includes('recap') ? null : of(s.creations, 10, 'creations')),
  },
];

/** Unlocks the person hasn't been told about yet (pure). */
export function newlyUnlocked(current: readonly Unlock[], seen: readonly Unlock[]): Unlock[] {
  return current.filter((u) => !seen.includes(u));
}

export interface RecapView {
  total: number;
  average: number | null;
  since: string | null;
  mostMade: { name: string; share: number } | null;
  distribution: { slug: string; name: string; count: number; share: number }[];
  top: Recap['top'];
  /** Only when enough entries are tagged with a cuisine to mean something. */
  cuisines: Recap['cuisines'] | null;
}

/** Turns raw recap data into what's worth showing — nothing thin (pure). */
export function recapView(r: Recap): RecapView {
  const distribution = r.byPrimary.map((p) => ({ ...p, share: r.total ? p.count / r.total : 0 }));
  const leader = distribution[0];
  // "Most made" only means something when one category actually leads.
  const mostMade =
    leader && distribution.length > 1 && leader.count > (distribution[1]?.count ?? 0)
      ? { name: leader.name, share: leader.share }
      : leader && distribution.length === 1
        ? { name: leader.name, share: 1 }
        : null;
  return {
    total: r.total,
    average: r.total >= 3 ? r.average : null,
    since: r.firstMadeOn,
    mostMade,
    distribution,
    top: r.top,
    cuisines: r.cuisineTagged >= 3 && r.cuisines.length > 0 ? r.cuisines : null,
  };
}
