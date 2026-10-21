import { avatarUrl } from '@/lib/supabase/storage';
import type { Profile, ProfileStats, ProfileSummary, ProfileWithViewer } from '@/types/models';

export const PROFILE_SUMMARY_SELECT = 'id, username, display_name, avatar_path';
export const PROFILE_SELECT =
  'id, username, display_name, bio, avatar_path, avatar_original_path, created_at, is_private, theme, frame';
export const PROFILE_WITH_VIEWER_SELECT = `${PROFILE_SELECT}, viewer_is_following, viewer_has_requested, viewer_has_blocked, unlocks:profile_unlocks(unlock)`;

export interface ProfileSummaryRow {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
}

export interface ProfileRow extends ProfileSummaryRow {
  bio: string;
  created_at: string;
  is_private: boolean;
  avatar_original_path?: string | null;
  theme?: 'saffron' | null;
  frame?: 'host' | null;
}

export interface ProfileWithViewerRow extends ProfileRow {
  viewer_is_following: boolean;
  viewer_has_requested: boolean;
  viewer_has_blocked: boolean;
  unlocks?: { unlock: string }[];
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
    avatarOriginalPath: row.avatar_original_path ?? null,
    avatarOriginalUrl: avatarUrl(row.avatar_original_path ?? null),
    createdAt: row.created_at,
    isPrivate: row.is_private ?? false,
    theme: row.theme ?? null,
    frame: row.frame ?? null,
  };
}

export function mapProfileWithViewer(row: ProfileWithViewerRow): ProfileWithViewer {
  return {
    ...mapProfile(row),
    viewerIsFollowing: row.viewer_is_following,
    viewerHasRequested: row.viewer_has_requested ?? false,
    viewerHasBlocked: row.viewer_has_blocked,
    madeTogether: (row.unlocks ?? []).some((u) => u.unlock === 'made_together'),
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
