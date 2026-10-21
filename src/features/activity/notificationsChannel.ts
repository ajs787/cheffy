import type { RealtimePostgresInsertPayload, SupabaseClient } from '@supabase/supabase-js';

export interface NotificationsSubscriptionOptions {
  client: Pick<SupabaseClient, 'channel' | 'removeChannel' | 'realtime' | 'auth'>;
  userId: string;
  /** A new notification row for this user arrived. */
  onInsert: (id: string) => void;
  /**
   * The channel (re)joined: initially, and after any reconnect. Anything that
   * happened while disconnected must be refetched here — Realtime doesn't
   * replay missed events.
   */
  onResync: () => void;
  /** Delay before retrying after an error (ms), by attempt. */
  backoff?: (attempt: number) => number;
}

let sequence = 0;

/**
 * A self-healing subscription to the user's notification inserts.
 *
 * Why not a plain `supabase.channel(...).on(...).subscribe()` in an effect:
 * realtime-js returns the *existing* channel for a topic, and removeChannel
 * is async, so re-subscribing with the same topic (remount, sign-out/in,
 * fast refresh) gets the old, already-joined channel and `.on()` throws —
 * live updates then stop until restart. Each subscription here uses its own
 * topic, retries on error/timeout, and resyncs on every join.
 */
export function subscribeToNotifications({
  client,
  userId,
  onInsert,
  onResync,
  backoff = (attempt) => Math.min(30_000, 1000 * 2 ** attempt),
}: NotificationsSubscriptionOptions): () => void {
  let stopped = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let channel: ReturnType<typeof client.channel> | null = null;

  const teardown = () => {
    if (channel) void client.removeChannel(channel);
    channel = null;
  };

  const start = async () => {
    if (stopped) return;
    // Make sure Realtime authorizes as the current session (RLS applies).
    const { data } = await client.auth.getSession();
    if (stopped) return;
    if (data.session?.access_token) await client.realtime.setAuth(data.session.access_token);
    if (stopped) return;

    sequence += 1;
    channel = client
      .channel(`notifications:${userId}:${sequence}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload: RealtimePostgresInsertPayload<{ id?: string }>) => {
          const id = payload.new?.id;
          if (id) onInsert(id);
        },
      )
      .subscribe((status) => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          attempt = 0;
          onResync();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          teardown();
          retryTimer = setTimeout(() => void start(), backoff(attempt++));
        }
      });
  };

  void start();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    teardown();
  };
}
