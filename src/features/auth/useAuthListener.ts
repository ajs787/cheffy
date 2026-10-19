import { useEffect } from 'react';

import { queryClient } from '@/lib/query/client';
import { supabase } from '@/lib/supabase/client';

import { useAuthStore } from './store';

/** Mirrors Supabase auth state into the auth store. Mount once at the root. */
export function useAuthListener(): void {
  useEffect(() => {
    const { setSession, setInitialized, setRecoveryMode } = useAuthStore.getState();
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setInitialized();
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT') {
        setRecoveryMode(false);
        queryClient.clear();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
}
