import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';

export type ModerationTargetType = 'post' | 'comment' | 'user';
export type ModerationAction = 'dismiss' | 'remove' | 'restore' | 'suspend' | 'unsuspend';

/** Everything reported about one post, comment or account, still open. */
export interface QueueItem {
  targetType: ModerationTargetType;
  targetId: string;
  reportCount: number;
  reasons: string[];
  details: string[];
  firstReported: string;
  preview: string | null;
  ownerId: string | null;
  ownerUsername: string | null;
  isHidden: boolean;
}

interface QueueRow {
  target_type: ModerationTargetType;
  target_id: string;
  report_count: number | string;
  reasons: string[] | null;
  details: string[] | null;
  first_reported: string;
  preview: string | null;
  owner_id: string | null;
  owner_username: string | null;
  is_hidden: boolean | null;
}

export async function fetchIsModerator(): Promise<boolean> {
  return unwrap(await supabase.rpc('is_moderator')) as boolean;
}

export async function fetchModerationQueue(): Promise<QueueItem[]> {
  const rows = (unwrap(await supabase.rpc('moderation_queue')) as QueueRow[] | null) ?? [];
  return rows.map((r) => ({
    targetType: r.target_type,
    targetId: r.target_id,
    reportCount: Number(r.report_count),
    reasons: r.reasons ?? [],
    details: r.details ?? [],
    firstReported: r.first_reported,
    preview: r.preview,
    ownerId: r.owner_id,
    ownerUsername: r.owner_username,
    isHidden: r.is_hidden ?? false,
  }));
}

export async function moderate(
  targetType: ModerationTargetType,
  targetId: string,
  action: ModerationAction,
  note = '',
): Promise<void> {
  unwrap(
    await supabase.rpc('moderate', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_action: action,
      p_note: note,
    }),
  );
}

/** Report reasons as people chose them, in plain words. */
export const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  inappropriate: 'Inappropriate',
  harassment: 'Harassment',
  not_homemade: 'Not homemade',
  intellectual_property: 'Someone else’s photo',
  other: 'Other',
};
