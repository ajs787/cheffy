import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { spacing } from '@/theme';

import { resendConfirmation } from '../api';
import { cooldownLeft } from '../cooldown';
import { parseRateLimit, rateLimitMessage } from '../rateLimit';
import { logAuthFailure } from '../useAuthSubmit';

/**
 * "Send it again" for the sign-up confirmation email, with a cooldown so
 * people can't hammer Supabase's email limit. `justSent` starts the cooldown
 * when an email has just gone out (right after signing up).
 */
export function ResendConfirmation({ email, justSent = false }: { email: string; justSent?: boolean }) {
  const [lastSent, setLastSent] = useState<number | null>(() => (justSent ? Date.now() : null));
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const left = cooldownLeft(lastSent, now);

  useEffect(() => {
    if (left === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [left]);

  const send = async () => {
    setSending(true);
    setStatus(null);
    try {
      await resendConfirmation(email);
      haptics.success();
      setStatus({ tone: 'ok', text: `Sent. Check ${email}, including spam.` });
    } catch (error) {
      haptics.error();
      logAuthFailure('resend_confirmation', error);
      const limit = parseRateLimit(error);
      setStatus({
        tone: 'error',
        text: limit
          ? rateLimitMessage(limit)
          : toUserMessage(error, 'We couldn’t send the email. Try again soon.'),
      });
    } finally {
      // Start the cooldown either way: a rate-limit error needs the wait too.
      setLastSent(Date.now());
      setNow(Date.now());
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppButton
        label={left > 0 ? `Resend email in ${left}s` : 'Resend confirmation email'}
        variant="secondary"
        size="md"
        disabled={left > 0}
        loading={sending}
        onPress={() => void send()}
        accessibilityHint="Sends the confirmation link again"
      />
      {status ? (
        <AppText
          variant="caption"
          color={status.tone === 'ok' ? 'textSecondary' : 'danger'}
          align="center"
          accessibilityLiveRegion="polite"
        >
          {status.text}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, alignSelf: 'stretch' },
});
