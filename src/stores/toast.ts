import { create } from 'zustand';

export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  current: ToastMessage | null;
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (message, tone = 'neutral') => set({ current: { id: nextId++, message, tone } }),
  dismiss: (id) => set((state) => (state.current?.id === id ? { current: null } : state)),
}));

/** Imperative helper for use outside React (e.g. mutation callbacks). */
export const toast = {
  show: (message: string) => useToastStore.getState().show(message, 'neutral'),
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  error: (message: string) => useToastStore.getState().show(message, 'error'),
};
