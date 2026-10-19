import * as Linking from 'expo-linking';
import { Share } from 'react-native';

import { formatRating } from '@/utils/rating';

export function postLink(postId: string): string {
  return Linking.createURL(`post/${postId}`);
}

export function profileLink(userId: string): string {
  return Linking.createURL(`user/${userId}`);
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
