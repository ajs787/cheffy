import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ControlledInput } from '@/components/shared/ControlledInput';
import { AppButton, AppHeader, AppText, Chip } from '@/components/ui';
import { useCollection, useCreateCollection, useUpdateCollection } from '@/features/collections/hooks';
import { collectionSchema, type CollectionFormValues } from '@/features/collections/schemas';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

export default function EditCollectionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useCollection(id);
  const create = useCreateCollection();
  const update = useUpdateCollection(id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, reset, formState } = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionSchema),
    defaultValues: { name: '', description: '', visibility: 'public' },
  });

  useEffect(() => {
    if (existing.data) {
      reset({
        name: existing.data.name,
        description: existing.data.description,
        visibility: existing.data.visibility,
      });
    }
  }, [existing.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (id) {
        await update.mutateAsync(values);
        toast.success('Collection updated');
        router.back();
      } else {
        const newId = await create.mutateAsync(values);
        toast.success('Collection created');
        router.replace({ pathname: '/collection/[id]', params: { id: newId } });
      }
    } catch (error) {
      setFormError(toUserMessage(error));
    }
  });

  return (
    <View style={styles.screen}>
      <AppHeader title={id ? 'Edit collection' : 'New collection'} leading="close" bordered />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ControlledInput
            control={control}
            name="name"
            label="Name"
            placeholder="My Best Bakes"
            maxLength={60}
            autoFocus={!id}
          />
          <ControlledInput
            control={control}
            name="description"
            label="Description"
            placeholder="Optional"
            multiline
            maxLength={280}
            showCount
          />
          <Controller
            control={control}
            name="visibility"
            render={({ field }) => (
              <View style={styles.visibility}>
                <AppText variant="calloutStrong">Who can see it</AppText>
                <View style={styles.chips}>
                  <Chip
                    label="Public"
                    selected={field.value === 'public'}
                    onPress={() => field.onChange('public')}
                  />
                  <Chip
                    label="Only me"
                    selected={field.value === 'private'}
                    onPress={() => field.onChange('private')}
                  />
                </View>
                <AppText variant="caption" color="textSecondary">
                  Private posts inside a public collection stay hidden from people who can’t see them.
                </AppText>
              </View>
            )}
          />
          {formError ? (
            <AppText variant="callout" color="danger">
              {formError}
            </AppText>
          ) : null}
          <AppButton
            label={id ? 'Save' : 'Create collection'}
            size="lg"
            fullWidth
            loading={formState.isSubmitting}
            onPress={onSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: SCREEN_GUTTER, gap: spacing.xl },
  visibility: { gap: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm },
});
