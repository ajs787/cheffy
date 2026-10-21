import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface PushPromptState {
  /** True once the explanation has been shown; it's offered automatically only once. */
  offered: boolean;
  /** Showing the explanation sheet right now. */
  visible: boolean;
  /** Offer push after a meaningful moment (first post, first follow). No-op after the first time. */
  offerOnce: () => void;
  /** Open from Settings, regardless of `offered`. */
  open: () => void;
  close: () => void;
}

export const usePushPromptStore = create<PushPromptState>()(
  persist(
    (set, get) => ({
      offered: false,
      visible: false,
      offerOnce: () => {
        if (!get().offered) set({ offered: true, visible: true });
      },
      open: () => set({ offered: true, visible: true }),
      close: () => set({ visible: false }),
    }),
    {
      name: 'cheffy-push-prompt',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ offered: state.offered }),
    },
  ),
);
