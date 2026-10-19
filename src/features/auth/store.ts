import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

interface AuthState {
  session: Session | null;
  /** True once the persisted session has been read from storage. */
  initialized: boolean;
  /** True after opening a password-recovery link, until a new password is set. */
  recoveryMode: boolean;
  setSession: (session: Session | null) => void;
  setInitialized: () => void;
  setRecoveryMode: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  initialized: false,
  recoveryMode: false,
  setSession: (session) => set({ session }),
  setInitialized: () => set({ initialized: true }),
  setRecoveryMode: (recoveryMode) => set({ recoveryMode }),
}));

export const useSession = () => useAuthStore((s) => s.session);
export const useUserId = () => useAuthStore((s) => s.session?.user.id ?? null);

/** For screens rendered only inside the signed-in area. */
export function useRequiredUserId(): string {
  const id = useUserId();
  if (!id) throw new Error('useRequiredUserId used outside the signed-in area');
  return id;
}
