import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/store';

import {
  fetchIsModerator,
  fetchModerationQueue,
  moderate,
  type ModerationAction,
  type ModerationTargetType,
} from './api';

const queueKey = ['moderation', 'queue'] as const;

/** Whether the signed-in person reviews reports (hides the screen otherwise). */
export function useIsModerator() {
  const me = useUserId();
  return useQuery({
    queryKey: ['moderation', 'isModerator', me],
    queryFn: fetchIsModerator,
    enabled: !!me,
    staleTime: 10 * 60_000,
  });
}

export function useModerationQueue(enabled = true) {
  return useQuery({ queryKey: queueKey, queryFn: fetchModerationQueue, enabled, staleTime: 30_000 });
}

export function useModerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      targetType: ModerationTargetType;
      targetId: string;
      action: ModerationAction;
      note?: string;
    }) => moderate(v.targetType, v.targetId, v.action, v.note),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queueKey });
      // Feeds and posts may have changed.
      void qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
