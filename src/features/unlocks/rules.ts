import type { Recap, Unlock, UnlockState } from './api';

export interface UnlockInfo {
  id: Unlock;
  title: string;
  description: string;
  /** e.g. "2 of 3 creations" — null once unlocked. */
  progress: (state: UnlockState) => string | null;
}

const of = (have: number, need: number, noun: string) => `${Math.min(have, need)} of ${need} ${noun}`;

/**
 * The unlocks people see and are told about, in order. ('made_together' is
 * still recorded by the database but is no longer a profile distinction; it
 * shows as a tag on the shared posts themselves.)
 */
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
      s.unlocked.includes('frame_host')
        ? null
        : of(s.referrals, REFERRAL_GOAL, 'friends joined with your code'),
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
  return current.filter((u) => !seen.includes(u) && UNLOCKS.some((info) => info.id === u));
}

/** Display info for one unlock. */
export function unlockInfo(id: Unlock): UnlockInfo {
  const info = UNLOCKS.find((u) => u.id === id);
  if (!info) throw new Error(`Unknown unlock ${id}`);
  return info;
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

/** The referral goal for the Host's frame, shown on Find Friends. */
export const REFERRAL_GOAL = 2;

export interface ReferralStatus {
  joined: number;
  goal: number;
  unlocked: boolean;
  /** Short line under the progress, e.g. "1 more friend to go". */
  label: string;
}

export function referralStatus(state: { referrals: number; unlocked: readonly string[] }): ReferralStatus {
  const unlocked = state.unlocked.includes('frame_host');
  const joined = Math.max(0, state.referrals);
  const left = Math.max(0, REFERRAL_GOAL - joined);
  return {
    joined,
    goal: REFERRAL_GOAL,
    unlocked,
    label: unlocked
      ? 'Unlocked — the Host’s frame is yours.'
      : left === 1
        ? '1 more friend to go'
        : `${left} friends to go`,
  };
}
