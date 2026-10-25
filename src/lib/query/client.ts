import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import { classifyError, setDeviceOnline } from '@/lib/errors';

/**
 * Reads only. Rate limits and normal errors (permissions, bad input) aren't
 * retried; while Supabase is unavailable we back off and stop quickly, so a
 * recovering database isn't hit by every open app at once.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  switch (classifyError(error)) {
    case 'unreachable':
    case 'timeout':
      return failureCount < 3;
    case 'unavailable':
      return failureCount < 2;
    case 'offline': // paused by onlineManager and resumed on reconnect
      return failureCount < 3;
    default:
      return false;
  }
}

/** Exponential backoff (1s, 2s, 4s… capped at 15s) with full jitter. */
export function retryDelayWithJitter(attempt: number): number {
  const cap = Math.min(1000 * 2 ** attempt, 15_000);
  return Math.round(cap / 2 + Math.random() * (cap / 2));
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: shouldRetryQuery,
      retryDelay: retryDelayWithJitter,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Refetch stale queries when the app comes back to the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}

// Pause queries offline and resume (with refetch) on reconnect. Network
// change events can be missed while the device sleeps, so the state is also
// re-read whenever the app returns to the foreground.
onlineManager.setEventListener((setOnline) => {
  // The error classifier needs the same answer to tell "offline" apart from
  // "the server is unreachable".
  const update = (online: boolean) => {
    setDeviceOnline(online);
    setOnline(online);
  };
  const refresh = () => {
    Network.getNetworkStateAsync()
      .then((state) => update(state.isConnected !== false))
      .catch(() => update(true));
  };
  const networkSubscription = Network.addNetworkStateListener((state) => {
    update(state.isConnected !== false);
  });
  const appStateSubscription = AppState.addEventListener('change', (status) => {
    if (status === 'active') refresh();
  });
  refresh();
  return () => {
    networkSubscription.remove();
    appStateSubscription.remove();
  };
});
