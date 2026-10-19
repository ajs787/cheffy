import { avatarUrl } from '@/lib/supabase/storage';
import type { Profile, ProfileStats, ProfileSummary, ProfileWithViewer } from '@/types/models';

export const PROFILE_SUMMARY_SELECT = 'id, username, display_name, avatar_path';
export const PROFILE_SELECT = 'id, username, display_name, bio, avatar_path, created_at';
export const PROFILE_WITH_VIEWER_SELECT = `${PROFILE_SELECT}, viewer_is_following, viewer_has_blocked`;

export interface ProfileSummaryRow {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
}

export interface ProfileRow extends ProfileSummaryRow {
  bio: string;
  created_at: string;
}

export interface ProfileWithViewerRow extends ProfileRow {
  viewer_is_following: boolean;
  viewer_has_blocked: boolean;
}

export function mapProfileSummary(row: ProfileSummaryRow): ProfileSummary {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: avatarUrl(row.avatar_path),
  };
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    ...mapProfileSummary(row),
    bio: row.bio,
    avatarPath: row.avatar_path,
    createdAt: row.created_at,
  };
}

export function mapProfileWithViewer(row: ProfileWithViewerRow): ProfileWithViewer {
  return {
    ...mapProfile(row),
    viewerIsFollowing: row.viewer_is_following,
    viewerHasBlocked: row.viewer_has_blocked,
  };
}

export interface ProfileStatsRow {
  followers: number;
  following: number;
  posts: number;
  by_primary: { slug: string; name: string; count: number }[];
}

export function mapProfileStats(row: ProfileStatsRow): ProfileStats {
  return {
    followers: row.followers,
    following: row.following,
    posts: row.posts,
    byPrimary: row.by_primary,
  };
}
