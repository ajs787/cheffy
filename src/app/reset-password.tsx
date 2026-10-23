import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AuthScaffold } from '@/components/shared/AuthScaffold';
import { ControlledInput } from '@/components/shared/ControlledInput';
import { AppButton, AppText } from '@/components/ui';
import { signOut, updatePassword } from '@/features/auth/api';
import { newPasswordSchema, type NewPasswordValues } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';

export default function ResetPasswordScreen() {
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await updatePassword(password);
      haptics.success();
      toast.success('Password updated');
      useAuthStore.getState().setRecoveryMode(false);
    } catch (error) {
      setFormError(toUserMessage(error));
    }
  });

  return (
    <AuthScaffold
      title="Choose a new password"
      showBack={false}
      footer={
        <AppText variant="calloutStrong" color="textSecondary" onPress={() => void signOut()}>
          Cancel and sign out
        </AppText>
      }
    >
      <ControlledInput
        control={control}
        name="password"
        label="New password"
        placeholder="At least 8 characters"
        password
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <ControlledInput
        control={control}
        name="confirm"
        label="Confirm password"
        password
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => void onSubmit()}
      />
      {formError ? (
        <AppText variant="callout" color="danger">
          {formError}
        </AppText>
      ) : null}
      <AppButton
        label="Save password"
        size="lg"
        fullWidth
        loading={formState.isSubmitting}
        onPress={onSubmit}
      />
    </AuthScaffold>
  );
}
