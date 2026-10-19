import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Visibility } from '@/types/models';

interface PreferencesState {
  /** Remembered so people who post to followers don't re-pick it every time. */
  defaultVisibility: Visibility;
  setDefaultVisibility: (visibility: Visibility) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      defaultVisibility: 'public',
      setDefaultVisibility: (defaultVisibility) => set({ defaultVisibility }),
    }),
    { name: 'cheffy-preferences', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
