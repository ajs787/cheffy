import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Check, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthScaffold } from '@/components/shared/AuthScaffold';
import { ControlledInput } from '@/components/shared/ControlledInput';
import { AppButton, AppText, EmptyState } from '@/components/ui';
import { signUp } from '@/features/auth/api';
import { ResendConfirmation } from '@/features/auth/components/ResendConfirmation';
import { useAuthSubmit } from '@/features/auth/useAuthSubmit';
import { signUpSchema, type SignUpValues } from '@/features/auth/schemas';
import { PRIVACY_URL } from '@/constants/app';
import { openWebPage } from '@/lib/links';
import { colors, radii, spacing, strokes } from '@/theme';

export default function SignUpScreen() {
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const auth = useAuthSubmit();
  const { control, handleSubmit } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', acceptedTerms: false as unknown as true },
  });

  // One request per press; the keyboard's Done key can't start a second one.
  const onSubmit = handleSubmit(async ({ email, password }) => {
    await auth.submit(async () => {
      const { needsConfirmation } = await signUp(email, password);
      if (needsConfirmation) setConfirmEmail(email.trim());
      // Otherwise the session starts and the root guard moves on to onboarding.
    });
  });

  if (confirmEmail) {
    return (
      <AuthScaffold title="Check your inbox">
        <EmptyState
          icon={Mail}
          title="Confirm your email"
          message={`We sent a link to ${confirmEmail}. Open it on this phone to finish creating your account. It can take a minute, and sometimes lands in spam.`}
        />
        <View style={styles.confirmActions}>
          <ResendConfirmation email={confirmEmail} justSent />
          <AppButton
            label="Back to sign in"
            variant="ghost"
            size="md"
            onPress={() => router.replace('/sign-in')}
          />
        </View>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      title="Start your kitchen diary"
      subtitle="Create an account to log what you make and follow friends."
      footer={
        <AppText variant="callout" color="textSecondary">
          Already have an account?{' '}
          <AppText variant="calloutStrong" color="accentStrong" onPress={() => router.replace('/sign-in')}>
            Sign in
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
      />
      <ControlledInput
        control={control}
        name="password"
        label="Password"
        placeholder="At least 8 characters"
        password
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => void onSubmit()}
      />
      <Controller
        control={control}
        name="acceptedTerms"
        render={({ field, fieldState }) => (
          <View>
            <Pressable
              onPress={() => field.onChange(!field.value)}
              style={styles.terms}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!field.value }}
              accessibilityLabel="I agree to the Terms of Use, Community Guidelines and Privacy Policy"
            >
              <View style={[styles.checkbox, field.value && styles.checkboxOn]}>
                {field.value ? (
                  <Check size={14} color={colors.textInverse} strokeWidth={strokes.bold + 0.5} />
                ) : null}
              </View>
              <AppText variant="callout" color="textSecondary" style={styles.termsText}>
                I agree to the{' '}
                <AppText variant="calloutStrong" color="text" onPress={() => router.push('/terms')}>
                  Terms of Use and Community Guidelines
                </AppText>
                , including zero tolerance for abusive content, and the{' '}
                <AppText variant="calloutStrong" color="text" onPress={() => void openWebPage(PRIVACY_URL)}>
                  Privacy Policy
                </AppText>
                .
              </AppText>
            </Pressable>
            {fieldState.error ? (
              <AppText variant="caption" color="danger" style={styles.termsError}>
                {fieldState.error.message}
              </AppText>
            ) : null}
          </View>
        )}
      />
      {auth.error ? (
        <AppText variant="callout" color="danger" accessibilityLiveRegion="polite">
          {auth.error}
        </AppText>
      ) : null}
      <AppButton
        label={auth.locked ? `Try again in ${auth.secondsLeft}s` : 'Create account'}
        size="lg"
        fullWidth
        loading={auth.busy}
        loadingLabel="Creating account…"
        disabled={auth.locked}
        onPress={onSubmit}
      />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  terms: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radii.xs + 2,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    backgroundColor: colors.surface,
  },
  checkboxOn: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
  termsText: { flex: 1 },
  confirmActions: { gap: spacing.sm },
  termsError: { marginTop: spacing.xs, marginLeft: 34 },
});
