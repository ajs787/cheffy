import { useQuery } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/store';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';

/**
 * Anonymous Takes: comments shown as "Chef #01" instead of a profile.
 * The database never tells the app who wrote one (only whether the viewer
 * did), so everything here works from the per-post Chef number.
 */

/** "Chef #01" … "Chef #99", "Chef #100". 0 = still being assigned. */
export function anonymousName(number: number): string {
  return number > 0 ? `Chef #${String(number).padStart(2, '0')}` : 'Anonymous Chef';
}

/** How a comment's writer is shown: "@username"-less name or Chef name. */
export function commentAuthorName(comment: {
  author: { username: string } | null;
  anonNumber?: number | null;
}): string {
  if (comment.author) return comment.author.username;
  return anonymousName(comment.anonNumber ?? 0);
}

export interface AnonymousTakesStatus {
  /** The feature is on for this account (rollout flag). */
  available: boolean;
  /** The viewer can post an anonymous take on this post now. */
  open: boolean;
  /** The viewer's existing Chef name on this post, if they have one. */
  name: string | null;
}

const CLOSED: AnonymousTakesStatus = { available: false, open: false, name: null };

export async function fetchAnonymousTakesStatus(postId: string | null): Promise<AnonymousTakesStatus> {
  const data = unwrap(
    await supabase.rpc('anonymous_takes_status', { p_post: postId }),
  ) as Partial<AnonymousTakesStatus> | null;
  return {
    available: data?.available === true,
    open: data?.open === true,
    name: typeof data?.name === 'string' ? data.name : null,
  };
}

export const anonymousTakesKey = (userId: string, postId: string | null) =>
  ['anonymous-takes', userId, postId ?? ''] as const;

/**
 * Whether the viewer can take anonymously on `postId` (and as whom), or,
 * with no post, whether the feature is on for them at all. Cached: it only
 * changes when the creator flips the switch or the rollout changes.
 */
export function useAnonymousTakesStatus(postId: string | null, enabled = true) {
  const me = useUserId();
  const query = useQuery({
    queryKey: anonymousTakesKey(me ?? '', postId),
    queryFn: () => fetchAnonymousTakesStatus(postId),
    enabled: enabled && !!me,
    staleTime: postId ? 5 * 60_000 : 30 * 60_000,
  });
  return query.data ?? CLOSED;
}
