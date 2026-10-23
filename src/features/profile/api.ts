import * as Crypto from 'expo-crypto';

import { unwrap } from '@/lib/errors';
import { parseInstagram } from '@/utils/instagram';
import { prepareAvatar } from '@/lib/images';
import { supabase } from '@/lib/supabase/client';
import { BUCKETS, removeFiles, uploadImageFile } from '@/lib/supabase/storage';
import type { Profile, ProfileStats, ProfileWithViewer } from '@/types/models';

import {
  mapProfile,
  mapProfileStats,
  mapProfileWithViewer,
  PROFILE_SELECT,
  PROFILE_WITH_VIEWER_SELECT,
  type ProfileRow,
  type ProfileStatsRow,
  type ProfileWithViewerRow,
} from './mappers';

/** The signed-in user's profile, or null if they haven't finished onboarding. */
export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const row = unwrap(
    await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle(),
  ) as ProfileRow | null;
  return row ? mapProfile(row) : null;
}

/** Another user's profile. Null when it doesn't exist or isn't visible (blocked). */
export async function fetchProfile(userId: string): Promise<ProfileWithViewer | null> {
  const row = unwrap(
    await supabase.from('profiles').select(PROFILE_WITH_VIEWER_SELECT).eq('id', userId).maybeSingle(),
  ) as ProfileWithViewerRow | null;
  return row ? mapProfileWithViewer(row) : null;
}

export async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  const row = unwrap(await supabase.rpc('profile_stats', { p_user_id: userId })) as ProfileStatsRow | null;
  // Null when this person has blocked the viewer.
  return row ? mapProfileStats(row) : { followers: 0, following: 0, posts: 0, byPrimary: [] };
}

/** Switches the account between public and private. */
export async function setAccountPrivacy(userId: string, isPrivate: boolean): Promise<Profile> {
  const row = unwrap(
    await supabase
      .from('profiles')
      .update({ is_private: isPrivate })
      .eq('id', userId)
      .select(PROFILE_SELECT)
      .single(),
  ) as ProfileRow;
  return mapProfile(row);
}

/** Opts in or out of Discover's "Most Hated" section. */
export async function setMostHatedOptIn(userId: string, allow: boolean): Promise<Profile> {
  const row = unwrap(
    await supabase
      .from('profiles')
      .update({ allow_most_hated: allow })
      .eq('id', userId)
      .select(PROFILE_SELECT)
      .single(),
  ) as ProfileRow;
  return mapProfile(row);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  return unwrap(await supabase.rpc('username_available', { p_username: username })) as boolean;
}

/** Uploads the circle crop and the original framing; returns both paths. */
async function uploadAvatar(userId: string, localUri: string): Promise<{ square: string; original: string }> {
  const prepared = await prepareAvatar(localUri);
  const id = Crypto.randomUUID();
  const square = `${userId}/${id}.jpg`;
  const original = `${userId}/${id}_original.jpg`;
  await Promise.all([
    uploadImageFile(BUCKETS.avatars, square, prepared.square.uri),
    uploadImageFile(BUCKETS.avatars, original, prepared.original.uri),
  ]);
  return { square, original };
}

/** The clean username to store (validation already ran in the form). */
function instagramFrom(input: string | undefined): string | null {
  const parsed = parseInstagram(input ?? '');
  return parsed.ok ? parsed.username : null;
}

export interface ProfileInput {
  username: string;
  displayName: string;
  bio: string;
  /** As typed: username, @username or profile link ('' removes it). */
  instagram?: string;
  /** Local file to upload, null to remove, undefined to keep. */
  avatarLocalUri?: string | null;
}

export async function createProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const avatar = input.avatarLocalUri ? await uploadAvatar(userId, input.avatarLocalUri) : null;
  const row = unwrap(
    await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: input.username,
        display_name: input.displayName,
        bio: input.bio,
        instagram_username: instagramFrom(input.instagram),
        avatar_path: avatar?.square ?? null,
        avatar_original_path: avatar?.original ?? null,
      })
      .select(PROFILE_SELECT)
      .single(),
  ) as ProfileRow;
  return mapProfile(row);
}

export async function updateProfile(userId: string, current: Profile, input: ProfileInput): Promise<Profile> {
  let avatarPath = current.avatarPath;
  let originalPath = current.avatarOriginalPath;
  if (input.avatarLocalUri) {
    const uploaded = await uploadAvatar(userId, input.avatarLocalUri);
    avatarPath = uploaded.square;
    originalPath = uploaded.original;
  } else if (input.avatarLocalUri === null) {
    avatarPath = null;
    originalPath = null;
  }

  const row = unwrap(
    await supabase
      .from('profiles')
      .update({
        username: input.username,
        display_name: input.displayName,
        bio: input.bio,
        instagram_username: instagramFrom(input.instagram),
        avatar_path: avatarPath,
        avatar_original_path: originalPath,
      })
      .eq('id', userId)
      .select(PROFILE_SELECT)
      .single(),
  ) as ProfileRow;

  // Clean up the replaced avatar; failure here is harmless.
  const replaced = [current.avatarPath, current.avatarOriginalPath].filter(
    (p): p is string => !!p && p !== avatarPath && p !== originalPath,
  );
  if (replaced.length) await removeFiles(BUCKETS.avatars, replaced).catch(() => undefined);
  return mapProfile(row);
}

/**
 * Deletes the account on the server (Edge Function `delete-account`): every
 * photo in Storage, then the auth user, which cascades to all their data.
 * Doing it server-side means a crash or lost connection can't leave photos
 * behind. Throws (and keeps the account) if any step fails.
 */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ deleted?: boolean }>('delete-account', {
    method: 'POST',
  });
  if (error || !data?.deleted) throw error ?? new Error('Account deletion failed');
  await supabase.auth.signOut({ scope: 'local' });
}
