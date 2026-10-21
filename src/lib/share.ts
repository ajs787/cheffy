import { Share } from 'react-native';

import { APP_DOWNLOAD_URL, WEB_URL } from '@/constants/app';
import { formatRating } from '@/utils/rating';

/** Shareable https links: they open Cheffy when installed, cheffy.me otherwise. */
export function webLink(path: string): string {
  return `${WEB_URL}/${path}`;
}

export function postLink(postId: string): string {
  return webLink(`post/${postId}`);
}

export function profileLink(userId: string): string {
  return webLink(`user/${userId}`);
}

export function inviteLink(code: string): string {
  return webLink(`invite/${code}`);
}

export async function sharePost(post: { id: string; title: string; rating: number | null }): Promise<void> {
  const url = postLink(post.id);
  const rating = post.rating === null ? '' : ` — ${formatRating(post.rating)}/10`;
  await Share.share({ message: `${post.title}${rating} on Cheffy\n${url}`, url });
}

export async function shareProfile(profile: { id: string; username: string }): Promise<void> {
  const url = profileLink(profile.id);
  await Share.share({ message: `@${profile.username} on Cheffy\n${url}`, url });
}

/**
 * A personal invite: who to follow, where to get the app (when configured),
 * and a link that opens the inviter's profile once Cheffy is installed.
 */
export function inviteMessage(
  inviter: { id: string; username: string },
  options: { downloadUrl?: string | null; profileUrl?: string; code?: string | null } = {},
): string {
  const downloadUrl = options.downloadUrl === undefined ? APP_DOWNLOAD_URL : options.downloadUrl;
  const lines = [
    `I'm keeping a diary of what I cook, bake and pour on Cheffy. Come cook with me — I'm @${inviter.username}.`,
    downloadUrl ? `Get the app: ${downloadUrl}` : null,
    options.code
      ? `Join with my invite: ${inviteLink(options.code)} (code ${options.code}).`
      : null,
    `Open my profile: ${options.profileUrl ?? profileLink(inviter.id)}`,
  ];
  return lines.filter(Boolean).join('\n\n');
}

/** Opens the system share sheet (Messages, Instagram, WhatsApp, Mail, Copy…). */
export async function shareInvite(
  inviter: { id: string; username: string },
  code?: string | null,
): Promise<boolean> {
  const result = await Share.share({ message: inviteMessage(inviter, { code }) });
  return result.action === Share.sharedAction;
}
