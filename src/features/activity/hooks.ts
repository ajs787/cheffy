import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/store';

import { fetchActivity, fetchUnreadCount, markAllRead, type ActivityItem } from './api';

export const activityKey = ['activity'] as const;
export const unreadKey = ['activity', 'unread'] as const;

export function useActivity() {
  const me = useUserId();
  return useQuery({ queryKey: activityKey, queryFn: fetchActivity, enabled: !!me, staleTime: 30_000 });
}

/** Unread count for the bell's badge; Realtime keeps it fresh while the app is open. */
export function useUnreadCount() {
  const me = useUserId();
  return useQuery({ queryKey: unreadKey, queryFn: fetchUnreadCount, enabled: !!me, staleTime: 30_000 });
}

/** Marks everything read (on leaving the inbox); the badge clears at once. */
export function useMarkActivityRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllRead,
    onMutate: () => {
      qc.setQueryData(unreadKey, 0);
    },
    onSuccess: () => {
      qc.setQueryData<ActivityItem[]>(activityKey, (items) => items?.map((i) => ({ ...i, read: true })));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: unreadKey }),
  });
}
