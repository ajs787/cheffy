import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, CircleX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ControlledInput } from '@/components/shared/ControlledInput';
import { AppButton, AppText } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toUserMessage } from '@/lib/errors';
import { colors, spacing, strokes } from '@/theme';

import { isUsernameAvailable, type ProfileInput } from '../api';
import { profileSchema, usernameSchema, type ProfileFormValues } from '../schemas';
import { AvatarPicker } from './AvatarPicker';

export interface ProfileFormProps {
  initial: ProfileFormValues;
  initialAvatarUrl: string | null;
  /** Username the user already owns (skip the availability check for it). */
  currentUsername?: string;
  submitLabel: string;
  onSubmit: (input: ProfileInput) => Promise<void>;
}

type Availability = 'idle' | 'checking' | 'available' | 'taken';

export function ProfileForm({
  initial,
  initialAvatarUrl,
  currentUsername,
  submitLabel,
  onSubmit,
}: ProfileFormProps) {
  const [avatar, setAvatar] = useState<{ uri: string | null; changed: boolean }>({
    uri: initialAvatarUrl,
    changed: false,
  });
  const [checked, setChecked] = useState<{ username: string; available: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setError } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: initial,
  });
  const username = useWatch({ control, name: 'username' });
  const displayName = useWatch({ control, name: 'displayName' });
  const debouncedUsername = useDebouncedValue(username, 350);

  // Availability is derived: only the network result lives in state.
  const parsedUsername = usernameSchema.safeParse(debouncedUsername);
  const candidate =
    parsedUsername.success && parsedUsername.data !== currentUsername ? parsedUsername.data : null;
  const availability: Availability =
    candidate === null
      ? 'idle'
      : checked?.username === candidate
        ? checked.available
          ? 'available'
          : 'taken'
        : 'checking';

  useEffect(() => {
    if (!candidate) return;
    let cancelled = false;
    isUsernameAvailable(candidate)
      .then((available) => !cancelled && setChecked({ username: candidate, available }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  const submit = handleSubmit(async (values) => {
    if (availability === 'taken') {
      setError('username', { message: 'That username is taken.' });
      return;
    }
    setFormError(null);
    try {
      await onSubmit({
        ...values,
        avatarLocalUri: avatar.changed ? avatar.uri : undefined,
      });
    } catch (error) {
      const message = toUserMessage(error);
      if (message.includes('username')) setError('username', { message });
      else setFormError(message);
    }
  });

  const usernameHelper =
    availability === 'checking'
      ? 'Checking…'
      : availability === 'available'
        ? 'Available'
        : 'Lowercase letters, numbers, dots and underscores.';

  return (
    <View style={styles.form}>
      <AvatarPicker
        uri={avatar.uri}
        name={displayName}
        onPick={(uri) => setAvatar({ uri, changed: true })}
        onRemove={avatar.uri ? () => setAvatar({ uri: null, changed: true }) : undefined}
      />
      <ControlledInput
        control={control}
        name="displayName"
        label="Name"
        placeholder="Your name"
        maxLength={50}
        autoComplete="name"
      />
      <View>
        <ControlledInput
          control={control}
          name="username"
          label="Username"
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          maxLength={24}
          helper={availability === 'taken' ? undefined : usernameHelper}
        />
        <View style={styles.status} pointerEvents="none">
          {availability === 'checking' ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : null}
          {availability === 'available' ? (
            <CircleCheck size={18} color={colors.accent} strokeWidth={strokes.bold} />
          ) : null}
          {availability === 'taken' ? (
            <CircleX size={18} color={colors.danger} strokeWidth={strokes.bold} />
          ) : null}
        </View>
        {availability === 'taken' ? (
          <AppText variant="caption" color="danger">
            That username is taken.
          </AppText>
        ) : null}
      </View>
      <ControlledInput
        control={control}
        name="bio"
        label="Bio"
        placeholder="What do you love to make?"
        multiline
        maxLength={160}
        showCount
        inputStyle={styles.bio}
      />
      {formError ? (
        <AppText variant="callout" color="danger">
          {formError}
        </AppText>
      ) : null}
      <AppButton label={submitLabel} size="lg" fullWidth loading={formState.isSubmitting} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  status: { position: 'absolute', right: spacing.md, top: 40 },
  bio: { minHeight: 72 },
});
