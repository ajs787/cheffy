import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useUserId } from '@/features/auth/store';
import { supabase } from '@/lib/supabase/client';
import { useNotificationBannerStore } from '@/stores/notificationBanner';

import { fetchNotification } from './api';
import { activityKey, unreadKey } from './hooks';
import { subscribeToNotifications } from './notificationsChannel';

/**
 * In-app (foreground) delivery: the signed-in user's new notifications
 * update the badge and inbox immediately and show a banner. This is not
 * push — when Cheffy is backgrounded or closed, the socket is gone and push
 * notifications (sent from the database) take over.
 */
export function useNotificationsRealtime() {
  const me = useUserId();
  const qc = useQueryClient();

  useEffect(() => {
    if (!me) return;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: unreadKey });
      void qc.invalidateQueries({ queryKey: activityKey });
    };
    const unsubscribe = subscribeToNotifications({
      client: supabase,
      userId: me,
      onResync: refresh,
      onInsert: (id) => {
        refresh();
        // Only live events get a banner (a resync just refreshes). The row
        // only has ids; fetch it with names and the post title.
        void fetchNotification(id)
          .then((item) => item && useNotificationBannerStore.getState().show(item))
          .catch(() => undefined);
      },
    });
    // Back from the background: the socket may have been suspended; catch up.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [me, qc]);
}
