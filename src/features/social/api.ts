import { mapProfileSummary, PROFILE_SUMMARY_SELECT, type ProfileSummaryRow } from '@/features/profile/mappers';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { fetchOne, fetchRows } from '@/lib/supabase/query';
import type { Comment, ReportReason, ReportTarget, UserListItem } from '@/types/models';
import { sanitizeSearch } from '@/utils/search';

/** Unique-violation code: the row already exists, which is fine for idempotent actions. */
const ALREADY_EXISTS = '23505';

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------
export async function followUser(me: string, target: string): Promise<void> {
  const { error } = await supabase.from('follows').insert({ follower_id: me, following_id: target });
  if (error && error.code !== ALREADY_EXISTS) throw error;
}

export async function unfollowUser(me: string, target: string): Promise<void> {
  unwrap(await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', target));
}

const USER_LIST_SELECT = `${PROFILE_SUMMARY_SELECT}, viewer_is_following`;

type UserListRow = ProfileSummaryRow & { viewer_is_following: boolean };

function mapUserListItem(row: UserListRow): UserListItem {
  return { ...mapProfileSummary(row), viewerIsFollowing: row.viewer_is_following };
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
// Comments
// ---------------------------------------------------------------------------
const COMMENT_SELECT = `id, post_id, body, created_at, author:profiles!comments_author_id_fkey(${PROFILE_SUMMARY_SELECT})`;

interface CommentRow {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  author: ProfileSummaryRow | null;
}

function mapComment(row: CommentRow): Comment | null {
  if (!row.author) return null;
  return {
    id: row.id,
    postId: row.post_id,
    body: row.body,
    createdAt: row.created_at,
    author: mapProfileSummary(row.author),
  };
}

export const COMMENTS_PAGE = 40;

/** Oldest first, so conversations read top to bottom. */
export async function fetchComments(
  postId: string,
  after: { createdAt: string; id: string } | null,
): Promise<Comment[]> {
  let query = supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(COMMENTS_PAGE);
  if (after) {
    query = query.or(`created_at.gt.${after.createdAt},and(created_at.eq.${after.createdAt},id.gt.${after.id})`);
  }
  const rows = await fetchRows<CommentRow>(query);
  return rows.map(mapComment).filter((c): c is Comment => c !== null);
}

export async function addComment(me: string, postId: string, body: string): Promise<Comment> {
  const row = await fetchOne<CommentRow>(
    supabase.from('comments').insert({ post_id: postId, author_id: me, body: body.trim() }).select(COMMENT_SELECT).single(),
  );
  const comment = mapComment(row);
  if (!comment) throw new Error('Comment author missing');
  return comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  const rows = await fetchRows<{ id: string }>(supabase.from('comments').delete().eq('id', commentId).select('id'));
  if (rows.length === 0) throw new Error('permission denied');
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
