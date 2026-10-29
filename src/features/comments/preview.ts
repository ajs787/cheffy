import type { CommentMediaKind } from '@/types/models';

/** A comment as one line of text: its words, or what it shows when it has none. */
export function commentPreviewText(body: string, mediaKind?: CommentMediaKind | null): string {
  const text = body.trim();
  if (text) return text;
  if (mediaKind === 'sticker') return 'Sent a sticker';
  if (mediaKind === 'photo') return 'Sent a photo';
  return '';
}
