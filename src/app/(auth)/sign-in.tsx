import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { AuthScaffold } from '@/components/shared/AuthScaffold';
import { ControlledInput } from '@/components/shared/ControlledInput';
import { AppButton, AppText } from '@/components/ui';
import { isEmailNotConfirmed, signIn } from '@/features/auth/api';
import { ResendConfirmation } from '@/features/auth/components/ResendConfirmation';
import { useAuthSubmit } from '@/features/auth/useAuthSubmit';
import { signInSchema, type SignInValues } from '@/features/auth/schemas';

export default function SignInScreen() {
  const auth = useAuthSubmit();
  // Set when the account exists but its email isn't confirmed yet.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const { control, handleSubmit } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setUnconfirmedEmail(null);
    await auth.submit('signin', async () => {
      try {
        await signIn(email, password);
      } catch (error) {
        if (isEmailNotConfirmed(error)) setUnconfirmedEmail(email.trim());
        throw error;
      }
    });
  });

  return (
    <AuthScaffold
      title="Welcome back"
      subtitle="Sign in to your kitchen."
      footer={
        <AppText variant="callout" color="textSecondary">
          New to Cheffy?{' '}
          <AppText variant="calloutStrong" color="accentStrong" onPress={() => router.replace('/sign-up')}>
            Create an account
          </AppText>
        </AppText>
      }
    >
      <ControlledInput
        control={control}
        name="email"
        label="Email"
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        testID="sign-in-email"
      />
      <ControlledInput
        control={control}
        name="password"
        label="Password"
        placeholder="Your password"
        password
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void onSubmit()}
        testID="sign-in-password"
      />
      <AppText
        variant="calloutStrong"
        color="textSecondary"
        style={styles.forgot}
        onPress={() => router.push('/forgot-password')}
        accessibilityRole="link"
      >
        Forgot password?
      </AppText>
      {auth.error ? (
        <AppText variant="callout" color="danger" accessibilityLiveRegion="polite">
          {auth.error}
        </AppText>
      ) : null}
      {unconfirmedEmail ? <ResendConfirmation email={unconfirmedEmail} /> : null}
      <AppButton
        label={auth.locked ? `Try again in ${auth.secondsLeft}s` : 'Sign in'}
        size="lg"
        fullWidth
        loading={auth.busy}
        loadingLabel="Signing in…"
        disabled={auth.locked}
        onPress={onSubmit}
      />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  forgot: { alignSelf: 'flex-end', marginTop: -4 },
});
