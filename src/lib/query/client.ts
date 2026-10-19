import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import { isNetworkError } from '@/lib/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => (isNetworkError(error) ? failureCount < 3 : failureCount < 1),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
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
  const refresh = () => {
    Network.getNetworkStateAsync()
      .then((state) => setOnline(state.isConnected !== false))
      .catch(() => setOnline(true));
  };
  const networkSubscription = Network.addNetworkStateListener((state) => {
    setOnline(state.isConnected !== false);
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
