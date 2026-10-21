import {
  mapProfileSummary,
  PROFILE_SUMMARY_SELECT,
  type ProfileSummaryRow,
} from '@/features/profile/mappers';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { fetchOne, fetchRows } from '@/lib/supabase/query';
import type { Comment } from '@/types/models';

const COMMENT_SELECT = `
  id, post_id, parent_id, body, created_at, like_count, reply_count,
  viewer_has_liked:viewer_has_liked_comment,
  author:profiles!comments_author_id_fkey(${PROFILE_SUMMARY_SELECT}),
  reply_to:profiles!comments_reply_to_user_id_fkey(${PROFILE_SUMMARY_SELECT})
`;

export interface CommentRow {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  like_count: number;
  reply_count: number;
  viewer_has_liked: boolean;
  author: ProfileSummaryRow | null;
  reply_to: ProfileSummaryRow | null;
}

/** Null when the author is hidden (blocked). */
export function mapComment(row: CommentRow): Comment | null {
  if (!row.author) return null;
  return {
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id,
    body: row.body,
    createdAt: row.created_at,
    author: mapProfileSummary(row.author),
    replyTo: row.reply_to ? mapProfileSummary(row.reply_to) : null,
    likeCount: row.like_count ?? 0,
    replyCount: row.reply_count ?? 0,
    viewerHasLiked: row.viewer_has_liked ?? false,
  };
}

export type CommentCursor = { createdAt: string; id: string } | null;

export const COMMENTS_PAGE = 30;
export const REPLIES_PAGE = 20;

const afterCursor = (cursor: NonNullable<CommentCursor>) =>
  `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`;

/** Top-level comments, oldest first so conversations read top to bottom. */
export async function fetchComments(postId: string, after: CommentCursor): Promise<Comment[]> {
  let query = supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .is('parent_id', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(COMMENTS_PAGE);
  if (after) query = query.or(afterCursor(after));
  const rows = await fetchRows<CommentRow>(query);
  return rows.map(mapComment).filter((c): c is Comment => c !== null);
}

/** One thread's replies, oldest first, loaded when someone opens it. */
export async function fetchReplies(parentId: string, after: CommentCursor): Promise<Comment[]> {
  let query = supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(REPLIES_PAGE);
  if (after) query = query.or(afterCursor(after));
  const rows = await fetchRows<CommentRow>(query);
  return rows.map(mapComment).filter((c): c is Comment => c !== null);
}

export interface ReplyTarget {
  /** The top-level comment the reply joins. */
  parentId: string;
  /** Who it answers. */
  user: Comment['author'];
}

export async function addComment(
  me: string,
  postId: string,
  body: string,
  reply?: ReplyTarget | null,
): Promise<Comment> {
  const row = await fetchOne<CommentRow>(
    supabase
      .from('comments')
      .insert({
        post_id: postId,
        author_id: me,
        body: body.trim(),
        parent_id: reply?.parentId ?? null,
        reply_to_user_id: reply?.user.id ?? null,
      })
      .select(COMMENT_SELECT)
      .single(),
  );
  const comment = mapComment(row);
  if (!comment) throw new Error('Comment author missing');
  return comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  const rows = await fetchRows<{ id: string }>(
    supabase.from('comments').delete().eq('id', commentId).select('id'),
  );
  if (rows.length === 0) throw new Error('permission denied');
}

/** Unique-violation: already liked, which is fine. */
const ALREADY_EXISTS = '23505';

export async function likeComment(me: string, commentId: string): Promise<void> {
  const { error } = await supabase.from('comment_likes').insert({ user_id: me, comment_id: commentId });
  if (error && error.code !== ALREADY_EXISTS) throw error;
}

export async function unlikeComment(me: string, commentId: string): Promise<void> {
  unwrap(await supabase.from('comment_likes').delete().eq('user_id', me).eq('comment_id', commentId));
}
