import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Clock, LinkIcon, MailCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { exchangeCode } from '@/features/auth/api';
import { callbackOutcome } from '@/features/auth/cooldown';
import { useAuthStore } from '@/features/auth/store';
import { toUserMessage } from '@/lib/errors';
import { colors } from '@/theme';

type Screen =
  | { kind: 'working' }
  | { kind: 'verified' }
  | { kind: 'confirmedElsewhere' }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

/**
 * Landing screen for email links (sign-up confirmation and password recovery).
 * Supabase only issues a `code` after it has verified the link, so a code that
 * can't be exchanged here (opened on another device or browser) still means
 * the email is confirmed: the person just needs to sign in.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string;
    type?: string;
    error_code?: string;
    error_description?: string;
  }>();
  const outcome = callbackOutcome(params);
  const [result, setResult] = useState<Screen | null>(null);
  // An old link opened while already signed in: nothing to sign in to.
  const signedIn = useAuthStore((s) => !!s.session);

  const code = outcome.kind === 'exchange' ? outcome.code : null;
  const recovery = outcome.kind === 'exchange' && outcome.recovery;

  useEffect(() => {
    if (!code) return;
    if (recovery) useAuthStore.getState().setRecoveryMode(true);
    exchangeCode(code)
      .then(() => {
        if (recovery) router.replace('/reset-password');
        else setResult({ kind: 'verified' });
      })
      .catch((e: unknown) => {
        useAuthStore.getState().setRecoveryMode(false);
        setResult(
          recovery
            ? { kind: 'error', message: toUserMessage(e, 'Open the reset link on the phone where you asked for it.') }
            : { kind: 'confirmedElsewhere' },
        );
      });
  }, [code, recovery]);

  const screen: Screen =
    result ??
    (outcome.kind === 'exchange'
      ? { kind: 'working' }
      : outcome.kind === 'expired'
        ? { kind: 'expired' }
        : { kind: 'error', message: outcome.message });

  // Signed-in screens are behind the root guards; "/" picks the right one.
  const continueHome = () => router.replace('/');
  const toSignIn = () => (signedIn ? continueHome() : router.replace('/sign-in'));

  return (
    <View style={styles.container}>
      {screen.kind === 'working' ? (
        <ActivityIndicator color={colors.textSecondary} accessibilityLabel="Confirming your email" />
      ) : screen.kind === 'verified' ? (
        <EmptyState
          icon={CircleCheck}
          title="You’re verified"
          message="Your email is confirmed. Let’s set up your kitchen."
          actionLabel="Continue"
          onAction={continueHome}
        />
      ) : screen.kind === 'confirmedElsewhere' ? (
        <EmptyState
          icon={MailCheck}
          title="Email confirmed"
          message="Your account is ready. Sign in with your email and password to continue."
          actionLabel={signedIn ? 'Continue' : 'Sign in'}
          onAction={toSignIn}
        />
      ) : screen.kind === 'expired' ? (
        <EmptyState
          icon={Clock}
          title="This link has expired"
          message="Confirmation links work once and expire after a while. Sign in and we’ll offer to send a fresh one."
          actionLabel={signedIn ? 'Continue' : 'Go to sign in'}
          onAction={toSignIn}
        />
      ) : (
        <EmptyState
          icon={LinkIcon}
          title="That link didn’t work"
          message={screen.message}
          actionLabel="Continue"
          onAction={continueHome}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
