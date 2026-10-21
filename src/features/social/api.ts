import { mapProfileSummary, PROFILE_SUMMARY_SELECT, type ProfileSummaryRow } from '@/features/profile/mappers';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { fetchRows } from '@/lib/supabase/query';
import type { FollowState, ReportReason, ReportTarget, UserListItem } from '@/types/models';
import { sanitizeSearch } from '@/utils/search';

/** Unique-violation code: the row already exists, which is fine for idempotent actions. */
const ALREADY_EXISTS = '23505';

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------
/**
 * Follows a public account, or asks to follow a private one. The database
 * decides, so a privacy switch mid-tap can't slip through.
 */
export async function followUser(target: string): Promise<Exclude<FollowState, 'none'>> {
  return unwrap(await supabase.rpc('follow_user', { p_target: target })) as Exclude<FollowState, 'none'>;
}

export async function unfollowUser(me: string, target: string): Promise<void> {
  unwrap(await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', target));
}

export async function cancelFollowRequest(me: string, target: string): Promise<void> {
  unwrap(await supabase.from('follow_requests').delete().eq('requester_id', me).eq('target_id', target));
}

/** Someone who follows you; they're notified only by losing access. */
export async function removeFollower(me: string, follower: string): Promise<void> {
  unwrap(await supabase.from('follows').delete().eq('follower_id', follower).eq('following_id', me));
}

export interface FollowRequest {
  user: UserListItem;
  createdAt: string;
}

export async function fetchFollowRequests(me: string): Promise<FollowRequest[]> {
  const rows = await fetchRows<{ created_at: string; user: UserListRow | null }>(
    supabase
      .from('follow_requests')
      .select(`created_at, user:profiles!follow_requests_requester_id_fkey(${USER_LIST_SELECT})`)
      .eq('target_id', me)
      .order('created_at', { ascending: false })
      .limit(200),
  );
  return rows.flatMap((row) => (row.user ? [{ user: mapUserListItem(row.user), createdAt: row.created_at }] : []));
}

export async function acceptFollowRequest(requester: string): Promise<void> {
  unwrap(await supabase.rpc('accept_follow_request', { p_requester: requester }));
}

export async function declineFollowRequest(me: string, requester: string): Promise<void> {
  unwrap(await supabase.from('follow_requests').delete().eq('requester_id', requester).eq('target_id', me));
}

export const USER_LIST_SELECT = `${PROFILE_SUMMARY_SELECT}, is_private, viewer_is_following, viewer_has_requested`;

export type UserListRow = ProfileSummaryRow & {
  is_private?: boolean;
  viewer_is_following: boolean;
  viewer_has_requested?: boolean;
};

export function mapUserListItem(row: UserListRow): UserListItem {
  return {
    ...mapProfileSummary(row),
    isPrivate: row.is_private ?? false,
    viewerIsFollowing: row.viewer_is_following,
    viewerHasRequested: row.viewer_has_requested ?? false,
  };
}

export const CONNECTIONS_PAGE = 30;

export async function fetchConnections(
  userId: string,
  type: 'followers' | 'following',
  offset: number,
): Promise<UserListItem[]> {
  const embed =
    type === 'followers'
      ? `profile:profiles!follows_follower_id_fkey(${USER_LIST_SELECT})`
      : `profile:profiles!follows_following_id_fkey(${USER_LIST_SELECT})`;
  const rows = await fetchRows<{ created_at: string; profile: UserListRow | null }>(
    supabase
      .from('follows')
      .select(`created_at, ${embed}`)
      .eq(type === 'followers' ? 'following_id' : 'follower_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + CONNECTIONS_PAGE - 1),
  );
  // Profiles hidden by a block come back null.
  return rows.flatMap((row) => (row.profile ? [mapUserListItem(row.profile)] : []));
}

export async function searchUsers(query: string): Promise<UserListItem[]> {
  const q = sanitizeSearch(query);
  if (q.length < 1) return [];
  const rows = await fetchRows<UserListRow>(
    supabase
      .from('profiles')
      .select(USER_LIST_SELECT)
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .order('username')
      .limit(25),
  );
  // Exact and prefix username matches first.
  const score = (u: UserListRow) => (u.username === q ? 0 : u.username.startsWith(q) ? 1 : 2);
  return rows.sort((a, b) => score(a) - score(b)).map(mapUserListItem);
}

export async function fetchSuggestedCooks(): Promise<UserListItem[]> {
  const rows = await fetchRows<UserListRow>(
    supabase.rpc('suggested_cooks', { p_limit: 12 }).select(USER_LIST_SELECT),
  );
  return rows.map(mapUserListItem);
}

// ---------------------------------------------------------------------------
// Likes & saves
// ---------------------------------------------------------------------------
export async function likePost(me: string, postId: string): Promise<void> {
  const { error } = await supabase.from('likes').insert({ user_id: me, post_id: postId });
  if (error && error.code !== ALREADY_EXISTS) throw error;
}

export async function unlikePost(me: string, postId: string): Promise<void> {
  unwrap(await supabase.from('likes').delete().eq('user_id', me).eq('post_id', postId));
}

export async function savePostForLater(me: string, postId: string): Promise<void> {
  const { error } = await supabase.from('saved_posts').insert({ user_id: me, post_id: postId });
  if (error && error.code !== ALREADY_EXISTS) throw error;
}

export async function unsavePost(me: string, postId: string): Promise<void> {
  unwrap(await supabase.from('saved_posts').delete().eq('user_id', me).eq('post_id', postId));
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------
export async function blockUser(me: string, target: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: me, blocked_id: target });
  if (error && error.code !== ALREADY_EXISTS) throw error;
}

export async function unblockUser(me: string, target: string): Promise<void> {
  unwrap(await supabase.from('user_blocks').delete().eq('blocker_id', me).eq('blocked_id', target));
}

export async function fetchBlockedUsers(): Promise<(UserListItem & { blockedAt: string })[]> {
  const rows = await fetchRows<{ created_at: string; profile: UserListRow | null }>(
    supabase
      .from('user_blocks')
      .select(`created_at, profile:profiles!user_blocks_blocked_id_fkey(${USER_LIST_SELECT})`)
      .order('created_at', { ascending: false }),
  );
  return rows.flatMap((row) => (row.profile ? [{ ...mapUserListItem(row.profile), blockedAt: row.created_at }] : []));
}

export async function reportContent(
  me: string,
  target: ReportTarget,
  reason: ReportReason,
  details: string,
): Promise<void> {
  unwrap(
    await supabase.from('reports').insert({
      reporter_id: me,
      target_type: target.type,
      target_user_id: target.type === 'user' ? target.userId : null,
      target_post_id: target.type === 'post' ? target.postId : null,
      target_comment_id: target.type === 'comment' ? target.commentId : null,
      reason,
      details: details.trim(),
    }),
  );
}
