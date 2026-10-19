import { router, useLocalSearchParams } from 'expo-router';
import { LinkIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { exchangeCode } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/store';
import { toUserMessage } from '@/lib/errors';
import { colors } from '@/theme';

/** Landing screen for email links (sign-up confirmation and password recovery). */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; type?: string; error_description?: string }>();
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const error =
    params.error_description ??
    (params.code ? exchangeError : 'This link is incomplete or has already been used.');

  useEffect(() => {
    if (!params.code || params.error_description) return;
    if (params.type === 'recovery') useAuthStore.getState().setRecoveryMode(true);
    exchangeCode(params.code)
      .then(() => router.replace(params.type === 'recovery' ? '/reset-password' : '/'))
      .catch((e: unknown) => {
        useAuthStore.getState().setRecoveryMode(false);
        setExchangeError(toUserMessage(e, 'This link has expired or was opened on a different device.'));
      });
  }, [params.code, params.type, params.error_description]);

  return (
    <View style={styles.container}>
      {error ? (
        <EmptyState
          icon={LinkIcon}
          title="That link didn’t work"
          message={error}
          actionLabel="Continue"
          onAction={() => router.replace('/')}
        />
      ) : (
        <ActivityIndicator color={colors.textSecondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
