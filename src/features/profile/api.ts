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
  const row = unwrap(await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle()) as
    | ProfileRow
    | null;
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
  const row = unwrap(await supabase.rpc('profile_stats', { p_user_id: userId })) as ProfileStatsRow;
  return mapProfileStats(row);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  return unwrap(await supabase.rpc('username_available', { p_username: username })) as boolean;
}

async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const prepared = await prepareAvatar(localUri);
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;
  await uploadImageFile(BUCKETS.avatars, path, prepared.uri);
  return path;
}

export interface ProfileInput {
  username: string;
  displayName: string;
  bio: string;
  /** Local file to upload, null to remove, undefined to keep. */
  avatarLocalUri?: string | null;
}

export async function createProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const avatarPath = input.avatarLocalUri ? await uploadAvatar(userId, input.avatarLocalUri) : null;
  const row = unwrap(
    await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: input.username,
        display_name: input.displayName,
        bio: input.bio,
        avatar_path: avatarPath,
      })
      .select(PROFILE_SELECT)
      .single(),
  ) as ProfileRow;
  return mapProfile(row);
}

export async function updateProfile(userId: string, current: Profile, input: ProfileInput): Promise<Profile> {
  let avatarPath = current.avatarPath;
  if (input.avatarLocalUri) {
    avatarPath = await uploadAvatar(userId, input.avatarLocalUri);
  } else if (input.avatarLocalUri === null) {
    avatarPath = null;
  }

  const row = unwrap(
    await supabase
      .from('profiles')
      .update({
        username: input.username,
        display_name: input.displayName,
        bio: input.bio,
        avatar_path: avatarPath,
      })
      .eq('id', userId)
      .select(PROFILE_SELECT)
      .single(),
  ) as ProfileRow;

  // Clean up the replaced avatar; failure here is harmless.
  if (current.avatarPath && current.avatarPath !== avatarPath) {
    await removeFiles(BUCKETS.avatars, [current.avatarPath]).catch(() => undefined);
  }
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
