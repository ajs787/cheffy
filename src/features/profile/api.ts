import * as Crypto from 'expo-crypto';

import { unwrap } from '@/lib/errors';
import { prepareAvatar } from '@/lib/images';
import { supabase } from '@/lib/supabase/client';
import { BUCKETS, listFolderFiles, removeFiles, uploadImageFile } from '@/lib/supabase/storage';
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

export interface ProfileInput {
  username: string;
  displayName: string;
  bio: string;
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
 * Deletes the account: Storage files first (they can only be removed through
 * the Storage API), then the auth user, which cascades to all their data.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const [postFiles, avatarFiles] = await Promise.all([
    listFolderFiles(BUCKETS.postImages, userId),
    listFolderFiles(BUCKETS.avatars, userId),
  ]);
  for (let i = 0; i < postFiles.length; i += 100) {
    await removeFiles(BUCKETS.postImages, postFiles.slice(i, i + 100));
  }
  await removeFiles(BUCKETS.avatars, avatarFiles);
  unwrap(await supabase.rpc('delete_account'));
  await supabase.auth.signOut({ scope: 'local' });
}
