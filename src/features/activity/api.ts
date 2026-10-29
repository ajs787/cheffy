import { mapUserListItem, USER_LIST_SELECT, type UserListRow } from '@/features/social/api';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { fetchRows } from '@/lib/supabase/query';
import { commentPreviewText } from '@/features/comments/preview';
import { signPostImagePaths } from '@/lib/supabase/storage';
import type { UserListItem } from '@/types/models';

export type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'follow_accepted'
  | 'post_like'
  | 'comment'
  | 'comment_reply'
  | 'comment_like'
  | 'collab_invite'
  | 'collab_accepted'
  | 'comment_mention';

export interface ActivityPost {
  id: string;
  title: string;
  thumbPath: string | null;
  thumbUrl: string | null;
}

export interface ActivityItem {
  id: string;
  type: NotificationType;
  at: string;
  read: boolean;
  actor: UserListItem;
  /** Null for follow events, or when the post is no longer visible. */
  post: ActivityPost | null;
  commentId: string | null;
  commentBody: string | null;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  created_at: string;
  read_at: string | null;
  comment_id: string | null;
  actor: UserListRow | null;
  post: { id: string; title: string; images: { thumb_path: string; position: number }[] } | null;
  comment: { body: string; media_kind?: 'photo' | 'sticker' | null } | null;
}

const NOTIFICATION_SELECT = `
  id, type, created_at, read_at, comment_id,
  actor:profiles!notifications_actor_id_fkey(${USER_LIST_SELECT}),
  post:posts(id, title, images:post_images(thumb_path, position)),
  comment:comments(body, media_kind)
`;

export const ACTIVITY_LIMIT = 100;

const POST_TYPES: readonly NotificationType[] = [
  'post_like',
  'comment',
  'comment_reply',
  'comment_like',
  'collab_invite',
  'collab_accepted',
  'comment_mention',
];

/** Maps a row; drops ones whose actor or post the viewer can no longer see. */
export function mapNotification(row: NotificationRow): ActivityItem | null {
  if (!row.actor) return null;
  if (POST_TYPES.includes(row.type) && !row.post) return null;
  const cover = row.post ? [...row.post.images].sort((a, b) => a.position - b.position)[0] : undefined;
  return {
    id: row.id,
    type: row.type,
    at: row.created_at,
    read: row.read_at !== null,
    actor: mapUserListItem(row.actor),
    post: row.post
      ? { id: row.post.id, title: row.post.title, thumbPath: cover?.thumb_path ?? null, thumbUrl: null }
      : null,
    commentId: row.comment_id,
    commentBody: row.comment ? commentPreviewText(row.comment.body, row.comment.media_kind) || null : null,
  };
}

export async function fetchActivity(): Promise<ActivityItem[]> {
  const rows = await fetchRows<NotificationRow>(
    supabase
      .from('notifications')
      .select(NOTIFICATION_SELECT)
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
  );
  const items = rows.map(mapNotification).filter((i): i is ActivityItem => i !== null);
  const paths = items.flatMap((i) => (i.post?.thumbPath ? [i.post.thumbPath] : []));
  const urls = paths.length ? await signPostImagePaths(paths) : {};
  return items.map((i) =>
    i.post?.thumbPath ? { ...i, post: { ...i.post, thumbUrl: urls[i.post.thumbPath] ?? null } } : i,
  );
}

/** One notification by id (for the in-app banner). */
export async function fetchNotification(id: string): Promise<ActivityItem | null> {
  const rows = await fetchRows<NotificationRow>(
    supabase.from('notifications').select(NOTIFICATION_SELECT).eq('id', id).limit(1),
  );
  return rows[0] ? mapNotification(rows[0]) : null;
}

export async function fetchUnreadCount(): Promise<number> {
  return Number(unwrap(await supabase.rpc('unread_notification_count')) ?? 0);
}

export async function markAllRead(): Promise<void> {
  unwrap(await supabase.rpc('mark_notifications_read'));
}

/** "liked your Iced Matcha" — what follows the actor's username. */
export function describe(item: Pick<ActivityItem, 'type' | 'post' | 'commentBody'>): string {
  const title = item.post?.title ?? 'your post';
  switch (item.type) {
    case 'follow':
      return 'started following you';
    case 'follow_request':
      return 'asked to follow you';
    case 'follow_accepted':
      return 'accepted your follow request';
    case 'post_like':
      return `liked your ${title}`;
    case 'comment':
      return `commented on ${title}`;
    case 'comment_reply':
      return `replied to you on ${title}`;
    case 'comment_like':
      return `liked your comment on ${title}`;
    case 'collab_invite':
      return `invited you to co-post ${item.post?.title ?? 'a creation'}`;
    case 'collab_accepted':
      return `is now a co-creator of ${title}`;
    case 'comment_mention':
      return `mentioned you in a comment on ${item.post?.title ?? 'a post'}`;
  }
}

/** Where tapping a notification goes. */
export type ActivityTarget =
  | { pathname: '/user/[id]'; params: { id: string } }
  | { pathname: '/post/[id]'; params: { id: string; focus?: string; comment?: string } };

const COMMENT_TYPES: readonly NotificationType[] = [
  'comment',
  'comment_reply',
  'comment_like',
  'comment_mention',
];

export function activityTarget(
  item: Pick<ActivityItem, 'type' | 'post' | 'actor'> & { commentId?: string | null },
): ActivityTarget {
  if (!item.post) return { pathname: '/user/[id]', params: { id: item.actor.id } };
  if (!COMMENT_TYPES.includes(item.type)) return { pathname: '/post/[id]', params: { id: item.post.id } };
  // Opens the post scrolled to that comment (its thread opened for a reply).
  return {
    pathname: '/post/[id]',
    params: item.commentId
      ? { id: item.post.id, focus: 'comments', comment: item.commentId }
      : { id: item.post.id, focus: 'comments' },
  };
}
