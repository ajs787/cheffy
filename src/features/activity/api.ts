import { mapProfileSummary, PROFILE_SUMMARY_SELECT, type ProfileSummaryRow } from '@/features/profile/mappers';
import { supabase } from '@/lib/supabase/client';
import { fetchRows } from '@/lib/supabase/query';
import { signPostImagePaths } from '@/lib/supabase/storage';
import type { ProfileSummary } from '@/types/models';

export interface ActivityPost {
  id: string;
  title: string;
  thumbPath: string | null;
  thumbUrl: string | null;
}

export type ActivityItem =
  | { kind: 'like'; key: string; at: string; actor: ProfileSummary; post: ActivityPost }
  | { kind: 'comment'; key: string; at: string; actor: ProfileSummary; post: ActivityPost; body: string }
  | {
      kind: 'follow';
      key: string;
      at: string;
      actor: ProfileSummary;
      viewerIsFollowing: boolean;
      viewerHasRequested: boolean;
      actorIsPrivate: boolean;
    };

interface PostEmbed {
  id: string;
  title: string;
  images: { thumb_path: string; position: number }[];
}

const POST_EMBED = 'post:posts!inner(id, title, author_id, images:post_images(thumb_path, position))';
const PER_KIND = 30;

function coverOf(post: PostEmbed): string | null {
  return [...(post.images ?? [])].sort((a, b) => a.position - b.position)[0]?.thumb_path ?? null;
}

/**
 * What happened around you, newest first: likes and comments on your posts
 * and new followers. Built from the same tables the app already reads.
 */
export async function fetchActivity(me: string): Promise<ActivityItem[]> {
  const [likes, comments, follows] = await Promise.all([
    fetchRows<{ created_at: string; user_id: string; user: ProfileSummaryRow | null; post: PostEmbed }>(
      supabase
        .from('likes')
        .select(`created_at, user_id, user:profiles!likes_user_id_fkey(${PROFILE_SUMMARY_SELECT}), ${POST_EMBED}`)
        .eq('post.author_id', me)
        .neq('user_id', me)
        .order('created_at', { ascending: false })
        .limit(PER_KIND),
    ),
    fetchRows<{ id: string; body: string; created_at: string; author: ProfileSummaryRow | null; post: PostEmbed }>(
      supabase
        .from('comments')
        .select(`id, body, created_at, author:profiles!comments_author_id_fkey(${PROFILE_SUMMARY_SELECT}), ${POST_EMBED}`)
        .eq('post.author_id', me)
        .neq('author_id', me)
        .order('created_at', { ascending: false })
        .limit(PER_KIND),
    ),
    fetchRows<{
      created_at: string;
      follower_id: string;
      profile:
        | (ProfileSummaryRow & { viewer_is_following: boolean; viewer_has_requested?: boolean; is_private?: boolean })
        | null;
    }>(
      supabase
        .from('follows')
        .select(`created_at, follower_id, profile:profiles!follows_follower_id_fkey(${PROFILE_SUMMARY_SELECT}, is_private, viewer_is_following, viewer_has_requested)`)
        .eq('following_id', me)
        .order('created_at', { ascending: false })
        .limit(PER_KIND),
    ),
  ]);

  const items: ActivityItem[] = [];
  const toPost = (post: PostEmbed): ActivityPost => ({ id: post.id, title: post.title, thumbPath: coverOf(post), thumbUrl: null });
  for (const like of likes) {
    if (like.user) {
      items.push({ kind: 'like', key: `like:${like.user_id}:${like.post.id}`, at: like.created_at, actor: mapProfileSummary(like.user), post: toPost(like.post) });
    }
  }
  for (const comment of comments) {
    if (comment.author) {
      items.push({
        kind: 'comment',
        key: `comment:${comment.id}`,
        at: comment.created_at,
        actor: mapProfileSummary(comment.author),
        post: toPost(comment.post),
        body: comment.body,
      });
    }
  }
  for (const follow of follows) {
    if (follow.profile) {
      items.push({
        kind: 'follow',
        key: `follow:${follow.follower_id}`,
        at: follow.created_at,
        actor: mapProfileSummary(follow.profile),
        viewerIsFollowing: follow.profile.viewer_is_following,
        viewerHasRequested: follow.profile.viewer_has_requested ?? false,
        actorIsPrivate: follow.profile.is_private ?? false,
      });
    }
  }
  items.sort((a, b) => b.at.localeCompare(a.at));

  const paths = items.flatMap((item) => (item.kind !== 'follow' && item.post.thumbPath ? [item.post.thumbPath] : []));
  const urls = paths.length ? await signPostImagePaths(paths) : {};
  return items.map((item) =>
    item.kind === 'follow' || !item.post.thumbPath
      ? item
      : { ...item, post: { ...item.post, thumbUrl: urls[item.post.thumbPath] ?? null } },
  );
}

/** True when anything happened after the time the inbox was last opened. */
export function hasUnread(items: readonly ActivityItem[], seenAt: string | null): boolean {
  const newest = items[0]?.at;
  return !!newest && (!seenAt || newest > seenAt);
}
