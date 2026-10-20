import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ActivitySeenState {
  /** ISO time the Activity inbox was last opened on this device. */
  seenAt: string | null;
  markSeen: () => void;
}

export const useActivitySeenStore = create<ActivitySeenState>()(
  persist(
    (set) => ({
      seenAt: null,
      markSeen: () => set({ seenAt: new Date().toISOString() }),
    }),
    { name: 'cheffy-activity-seen', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
