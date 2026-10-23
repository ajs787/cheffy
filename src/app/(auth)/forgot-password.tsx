import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AuthScaffold } from '@/components/shared/AuthScaffold';
import { ControlledInput } from '@/components/shared/ControlledInput';
import { AppButton, AppText, EmptyState } from '@/components/ui';
import { sendPasswordReset } from '@/features/auth/api';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas';
import { useAuthSubmit } from '@/features/auth/useAuthSubmit';

export default function ForgotPasswordScreen() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const auth = useAuthSubmit();
  const { control, handleSubmit } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    await auth.submit('password_reset', async () => {
      await sendPasswordReset(email);
      setSentTo(email);
    });
  });

  if (sentTo) {
    return (
      <AuthScaffold title="Check your inbox">
        <EmptyState
          icon={MailCheck}
          title="Reset link sent"
          message={`If an account exists for ${sentTo}, you’ll get a link to choose a new password. Open it on this phone.`}
          actionLabel="Back to sign in"
          onAction={() => router.replace('/sign-in')}
        />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold title="Reset password" subtitle="We’ll email you a link to choose a new one.">
      <ControlledInput
        control={control}
        name="email"
        label="Email"
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void onSubmit()}
      />
      {auth.error ? (
        <AppText variant="callout" color="danger" accessibilityLiveRegion="polite">
          {auth.error}
        </AppText>
      ) : null}
      <AppButton
        label={auth.locked ? `Try again in ${auth.secondsLeft}s` : 'Send reset link'}
        size="lg"
        fullWidth
        loading={auth.busy}
        loadingLabel="Sending…"
        disabled={auth.locked}
        onPress={onSubmit}
      />
    </AuthScaffold>
  );
}
