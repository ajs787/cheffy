import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { useUserId } from '@/features/auth/store';

import type { ProfileSummary } from '@/types/models';

import type { ComposeImage, PostFormValues } from './schemas';

/**
 * A safety copy of the entry being written, kept on this phone so it survives
 * the app being closed or killed, a crash, or a sign-out mid-entry. It is
 * written as you type, cleared once the entry is saved (as a draft or a post)
 * or discarded on purpose, and offered back the next time Create opens.
 *
 * One slot per signed-in account (never shared between accounts). Only the
 * entry being written is kept, not every draft: saved drafts live in the
 * account (posts with status 'draft').
 */
export interface ComposeRecovery {
  /** The post id the entry will be saved under (kept so a retry updates, not duplicates). */
  postId: string;
  /** 'new' for a fresh entry, 'edit' when changing an existing draft or post. */
  mode: 'new' | 'edit';
  values: PostFormValues;
  madeWith: ProfileSummary[];
  /** ms since epoch */
  savedAt: number;
}

const recoveryKey = (userId: string) => `cheffy-compose-recovery:${userId}`;
const madeWithKey = (userId: string, postId: string) => `cheffy-draft-made-with:${userId}:${postId}`;

function isRecovery(value: unknown): value is ComposeRecovery {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ComposeRecovery>;
  return (
    typeof v.postId === 'string' &&
    (v.mode === 'new' || v.mode === 'edit') &&
    !!v.values &&
    typeof v.values.title === 'string' &&
    Array.isArray(v.values.images) &&
    typeof v.savedAt === 'number'
  );
}

export async function readComposeRecovery(userId: string): Promise<ComposeRecovery | null> {
  try {
    const raw = await AsyncStorage.getItem(recoveryKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecovery(parsed)) return null;
    return { ...parsed, madeWith: Array.isArray(parsed.madeWith) ? parsed.madeWith : [] };
  } catch {
    return null;
  }
}

export async function writeComposeRecovery(userId: string, recovery: ComposeRecovery): Promise<void> {
  // Signed photo URLs expire; they're re-signed from the post when restored.
  const values: PostFormValues = {
    ...recovery.values,
    images: recovery.values.images.map((image) => (image.kind === 'remote' ? { ...image, uri: null } : image)),
  };
  await AsyncStorage.setItem(recoveryKey(userId), JSON.stringify({ ...recovery, values })).catch(
    () => undefined,
  );
}

/** Clears the safety copy, but only if it still belongs to `postId` (when given). */
export async function clearComposeRecovery(userId: string, postId?: string): Promise<void> {
  if (postId) {
    const current = await readComposeRecovery(userId);
    if (current && current.postId !== postId) return;
  }
  await AsyncStorage.removeItem(recoveryKey(userId)).catch(() => undefined);
}

/** Whether a stored entry has anything worth offering back. */
export function hasContent(values: PostFormValues): boolean {
  return (
    values.title.trim().length > 0 ||
    values.images.length > 0 ||
    values.rating !== null ||
    values.review.trim().length > 0 ||
    values.story.trim().length > 0 ||
    values.tags.length > 0 ||
    values.primaryCategoryId.length > 0
  );
}

/** Photo files picked on this phone can be cleared by the system; checks one. */
export function localPhotoExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Drops picked photos whose files are gone, reporting how many were dropped. */
export function withoutMissingLocalPhotos(
  images: ComposeImage[],
  exists: (uri: string) => boolean = localPhotoExists,
): { images: ComposeImage[]; missing: number } {
  const kept = images.filter((image) => image.kind !== 'local' || exists(image.uri));
  return { images: kept, missing: images.length - kept.length };
}

/**
 * Re-attaches fresh signed URLs to uploaded photos of a restored entry using
 * the post as loaded now. Photos the post no longer has keep a null URL and
 * show as missing until removed.
 */
export function refreshRemoteImages(
  images: ComposeImage[],
  current: { id: string; url: string | null }[],
): ComposeImage[] {
  const urls = new Map(current.map((image) => [image.id, image.url]));
  return images.map((image) => (image.kind === 'remote' ? { ...image, uri: urls.get(image.id) ?? null } : image));
}

/**
 * "Made with" people aren't invited until a draft is posted, so the account
 * has nowhere to keep them. They're remembered on this phone per draft.
 */
export async function readDraftMadeWith(userId: string, postId: string): Promise<ProfileSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(madeWithKey(userId, postId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ProfileSummary[]) : [];
  } catch {
    return [];
  }
}

export async function writeDraftMadeWith(userId: string, postId: string, people: ProfileSummary[]): Promise<void> {
  const key = madeWithKey(userId, postId);
  await (people.length > 0
    ? AsyncStorage.setItem(
        key,
        JSON.stringify(
          people.map((p) => ({ id: p.id, username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl })),
        ),
      )
    : AsyncStorage.removeItem(key)
  ).catch(() => undefined);
}

/** Whether the signed-in account has an unsaved entry on this phone (re-checked when `when` turns true). */
export function useHasUnsavedEntry(when: boolean): boolean {
  const me = useUserId();
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!me || !when) return;
    let active = true;
    void readComposeRecovery(me).then((saved) => {
      if (active) setHas(!!saved && hasContent(saved.values));
    });
    return () => {
      active = false;
    };
  }, [me, when]);
  return has;
}
