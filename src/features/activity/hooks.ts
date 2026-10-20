import { useQuery } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/store';
import { useActivitySeenStore } from '@/stores/activity';

import { fetchActivity, hasUnread } from './api';

export const activityKey = ['activity'] as const;

export function useActivity() {
  const me = useUserId();
  return useQuery({
    queryKey: activityKey,
    queryFn: () => fetchActivity(me!),
    enabled: !!me,
    staleTime: 60_000,
  });
}

/** Drives the dot on Home's bell. */
export function useHasUnreadActivity(): boolean {
  const { data } = useActivity();
  const seenAt = useActivitySeenStore((s) => s.seenAt);
  return hasUnread(data ?? [], seenAt);
}
