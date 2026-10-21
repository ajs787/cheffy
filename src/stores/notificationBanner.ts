import { create } from 'zustand';

import type { ActivityItem } from '@/features/activity/api';

interface BannerState {
  current: ActivityItem | null;
  /** Ids already shown this session, so nothing pops up twice. */
  seen: Set<string>;
  show: (item: ActivityItem) => void;
  dismiss: (id: string) => void;
}

export const useNotificationBannerStore = create<BannerState>((set, get) => ({
  current: null,
  seen: new Set(),
  show: (item) => {
    if (get().seen.has(item.id)) return;
    set({ current: item, seen: new Set(get().seen).add(item.id) });
  },
  dismiss: (id) => {
    if (get().current?.id === id) set({ current: null });
  },
}));
