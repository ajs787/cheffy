import { create } from 'zustand';

import type { ActivityItem } from '@/features/activity/api';

/** At most this many waiting; older ones are dropped (they're all in Activity). */
const MAX_QUEUE = 3;

interface BannerState {
  /** The banner on screen; the rest wait their turn so banners never overlap. */
  current: ActivityItem | null;
  queue: ActivityItem[];
  /** Ids already shown this session, so nothing pops up twice. */
  seen: Set<string>;
  show: (item: ActivityItem) => void;
  /**
   * Hides a banner only. The notification stays in Activity with its
   * read/unread state unchanged.
   */
  dismiss: (id: string) => void;
  /** Shows the next waiting banner (the host calls it once the last one has animated out). */
  advance: () => void;
}

export const useNotificationBannerStore = create<BannerState>((set, get) => ({
  current: null,
  queue: [],
  seen: new Set(),
  show: (item) => {
    const { seen, current, queue } = get();
    if (seen.has(item.id)) return;
    const nextSeen = new Set(seen).add(item.id);
    if (!current && queue.length === 0) set({ current: item, seen: nextSeen });
    else set({ queue: [...queue, item].slice(-MAX_QUEUE), seen: nextSeen });
  },
  dismiss: (id) => {
    const { current, queue } = get();
    if (current?.id === id) set({ current: null });
    else set({ queue: queue.filter((q) => q.id !== id) });
  },
  advance: () => {
    const { current, queue } = get();
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    set({ current: next ?? null, queue: rest });
  },
}));
