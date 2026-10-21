import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';

export type Unlock = 'theme_saffron' | 'frame_host' | 'made_together' | 'recap';

export interface UnlockState {
  unlocked: Unlock[];
  creations: number;
  referrals: number;
  collaborations: number;
}

export async function fetchUnlocks(): Promise<UnlockState> {
  const row = unwrap(await supabase.rpc('my_unlocks')) as {
    unlocked: Unlock[];
    creations: number;
    referrals: number;
    collaborations: number;
  };
  return {
    unlocked: row.unlocked ?? [],
    creations: Number(row.creations),
    referrals: Number(row.referrals),
    collaborations: Number(row.collaborations),
  };
}

export async function fetchInviteCode(): Promise<string> {
  return unwrap(await supabase.rpc('my_invite_code')) as string;
}

export async function redeemInviteCode(code: string): Promise<void> {
  unwrap(await supabase.rpc('redeem_invite_code', { p_code: code }));
}

export type ProfileTheme = 'saffron' | null;
export type ProfileFrame = 'host' | null;

export async function setProfileStyle(theme: ProfileTheme, frame: ProfileFrame): Promise<void> {
  unwrap(await supabase.rpc('set_profile_style', { p_theme: theme, p_frame: frame }));
}

export interface Recap {
  total: number;
  average: number | null;
  firstMadeOn: string | null;
  byPrimary: { slug: string; name: string; count: number }[];
  top: { postId: string; title: string; rating: number } | null;
  cuisines: { name: string; count: number }[];
  cuisineTagged: number;
}

export async function fetchRecap(): Promise<Recap> {
  const r = unwrap(await supabase.rpc('cooking_recap')) as {
    total: number;
    average: number | null;
    first_made_on: string | null;
    by_primary: { slug: string; name: string; count: number }[];
    top: { post_id: string; title: string; rating: number } | null;
    cuisines: { name: string; count: number }[];
    cuisine_tagged: number;
  };
  return {
    total: Number(r.total),
    average: r.average === null ? null : Number(r.average),
    firstMadeOn: r.first_made_on,
    byPrimary: (r.by_primary ?? []).map((p) => ({ ...p, count: Number(p.count) })),
    top: r.top ? { postId: r.top.post_id, title: r.top.title, rating: Number(r.top.rating) } : null,
    cuisines: (r.cuisines ?? []).map((c) => ({ ...c, count: Number(c.count) })),
    cuisineTagged: Number(r.cuisine_tagged),
  };
}
