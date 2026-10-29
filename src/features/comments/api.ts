import {
  mapProfileSummary,
  PROFILE_SUMMARY_SELECT,
  type ProfileSummaryRow,
} from '@/features/profile/mappers';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { fetchOne, fetchRows } from '@/lib/supabase/query';
import { avatarUrl, BUCKETS, signPaths } from '@/lib/supabase/storage';
import type { Comment, CommentMediaKind, ProfileSummary } from '@/types/models';

const COMMENT_SELECT = `
  id, post_id, parent_id, body, created_at, like_count, reply_count,
  media_kind, media_path, media_thumb_path, media_width, media_height, media_hidden_at,
  viewer_has_liked:viewer_has_liked_comment,
  author:profiles!comments_author_id_fkey(${PROFILE_SUMMARY_SELECT}),
  reply_to:profiles!comments_reply_to_user_id_fkey(${PROFILE_SUMMARY_SELECT}),
  mentions:comment_mentions(username, user_id, user:profiles!comment_mentions_user_id_fkey(username))
`;

export interface CommentRow {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  like_count: number;
  reply_count: number;
  media_kind?: CommentMediaKind | null;
  media_path?: string | null;
  media_thumb_path?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  media_hidden_at?: string | null;
  viewer_has_liked: boolean;
  author: ProfileSummaryRow | null;
  reply_to: ProfileSummaryRow | null;
  mentions?: { username: string; user_id: string; user: { username: string } | null }[] | null;
}

/** Null when the author is hidden (blocked). Thumb URLs are filled in by `withSignedThumbs`. */
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
    media:
      row.media_kind && row.media_path
        ? {
            kind: row.media_kind,
            path: row.media_path,
            thumbPath: row.media_thumb_path ?? row.media_path,
            thumbUrl: null,
            width: row.media_width ?? 1,
            height: row.media_height ?? 1,
            removed: !!row.media_hidden_at,
          }
        : null,
    mentions: (row.mentions ?? []).map((m) => ({
      username: m.username,
      userId: m.user_id,
      currentUsername: m.user?.username ?? null,
    })),
  };
}

/** Signs every visible picture's thumb in one request per page. */
export async function withSignedThumbs(comments: Comment[]): Promise<Comment[]> {
  const paths = comments.flatMap((c) =>
    c.media && !c.media.removed && c.media.thumbPath ? [c.media.thumbPath] : [],
  );
  if (paths.length === 0) return comments;
  let urls: Record<string, string> = {};
  try {
    urls = await signPaths(BUCKETS.commentMedia, paths);
  } catch {
    // The text still shows; pictures show a placeholder until a refresh.
  }
  return comments.map((c) =>
    c.media?.thumbPath ? { ...c, media: { ...c.media, thumbUrl: urls[c.media.thumbPath] ?? null } } : c,
  );
}

export type CommentCursor = { createdAt: string; id: string } | null;

export const COMMENTS_PAGE = 30;
export const REPLIES_PAGE = 20;

const afterCursor = (cursor: NonNullable<CommentCursor>) =>
  `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`;

const mapRows = (rows: CommentRow[]) =>
  withSignedThumbs(rows.map(mapComment).filter((c): c is Comment => c !== null));

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
  return mapRows(await fetchRows<CommentRow>(query));
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
  return mapRows(await fetchRows<CommentRow>(query));
}

/** Which thread a comment is in (for opening it from a notification). */
export async function fetchCommentThread(
  commentId: string,
): Promise<{ id: string; parentId: string | null } | null> {
  const rows = await fetchRows<{ id: string; parent_id: string | null }>(
    supabase.from('comments').select('id, parent_id').eq('id', commentId).limit(1),
  );
  return rows[0] ? { id: rows[0].id, parentId: rows[0].parent_id } : null;
}

export interface ReplyTarget {
  /** The top-level comment the reply joins. */
  parentId: string;
  /** Who it answers. */
  user: Comment['author'];
}

export interface NewComment {
  body: string;
  reply?: ReplyTarget | null;
  /** People picked from @suggestions whose names are still in the text. */
  mentionIds?: string[];
  /** A finished upload (see media.ts). */
  uploadId?: string | null;
}

export async function addComment(me: string, postId: string, input: NewComment): Promise<Comment> {
  const row = await fetchOne<CommentRow>(
    supabase
      .from('comments')
      .insert({
        post_id: postId,
        author_id: me,
        body: input.body.trim(),
        parent_id: input.reply?.parentId ?? null,
        reply_to_user_id: input.reply?.user.id ?? null,
        mention_ids: input.mentionIds ?? [],
        media_upload_id: input.uploadId ?? null,
      })
      .select(COMMENT_SELECT)
      .single(),
  );
  const comment = mapComment(row);
  if (!comment) throw new Error('Comment author missing');
  // The mentions are written by a trigger in the same statement, so the
  // insert's own response can't see them yet: read them back (only when
  // some were sent). If that read fails, they link after the next refresh.
  if (input.mentionIds?.length) {
    try {
      const mentions = await fetchRows<NonNullable<CommentRow['mentions']>[number]>(
        supabase
          .from('comment_mentions')
          .select('username, user_id, user:profiles!comment_mentions_user_id_fkey(username)')
          .eq('comment_id', comment.id),
      );
      comment.mentions = mentions.map((m) => ({
        username: m.username,
        userId: m.user_id,
        currentUsername: m.user?.username ?? null,
      }));
    } catch {
      // Shown as plain text until the thread reloads.
    }
  }
  return (await withSignedThumbs([comment]))[0]!;
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

export type MentionRelation = 'mutual' | 'following' | 'follower' | 'thread' | 'other';

export interface MentionSuggestion extends ProfileSummary {
  relation: MentionRelation;
}

const RELATION_RANK: Record<MentionRelation, number> = {
  mutual: 0,
  following: 1,
  follower: 2,
  thread: 3,
  other: 4,
};

/** People to @mention: friends and followed accounts first (one request). */
export async function fetchMentionSuggestions(query: string, postId?: string): Promise<MentionSuggestion[]> {
  const rows = unwrap(
    await supabase.rpc('mention_suggestions', { p_query: query, p_post: postId ?? null, p_limit: 8 }),
  ) as
    | {
        id: string;
        username: string;
        display_name: string;
        avatar_path: string | null;
        relation: MentionRelation;
      }[]
    | null;
  const q = query.toLowerCase();
  // Keep the database's ranking (PostgREST doesn't promise row order).
  return (rows ?? [])
    .map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: avatarUrl(r.avatar_path),
      relation: r.relation,
    }))
    .sort(
      (a, b) =>
        Number(b.username === q) - Number(a.username === q) ||
        RELATION_RANK[a.relation] - RELATION_RANK[b.relation] ||
        Number(b.username.startsWith(q)) - Number(a.username.startsWith(q)) ||
        a.username.localeCompare(b.username),
    );
}
