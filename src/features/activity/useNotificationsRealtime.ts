import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useUserId } from '@/features/auth/store';
import { supabase } from '@/lib/supabase/client';
import { useNotificationBannerStore } from '@/stores/notificationBanner';

import { fetchNotification } from './api';
import { activityKey, unreadKey } from './hooks';

/**
 * Listens for the signed-in user's new notifications while the app is open
 * (Supabase Realtime, which applies RLS). Refreshes the badge and inbox and
 * shows a banner. Unsubscribes on sign-out or unmount.
 */
export function useNotificationsRealtime() {
  const me = useUserId();
  const qc = useQueryClient();
  const show = useNotificationBannerStore((s) => s.show);

  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`notifications:${me}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${me}` },
        (payload) => {
          void qc.invalidateQueries({ queryKey: unreadKey });
          void qc.invalidateQueries({ queryKey: activityKey });
          const id = (payload.new as { id?: string }).id;
          if (!id) return;
          // The row only has ids; fetch it with names and the post title.
          void fetchNotification(id)
            .then((item) => item && show(item))
            .catch(() => undefined);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me, qc, show]);
}
