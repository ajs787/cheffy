import { zodResolver } from '@hookform/resolvers/zod';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { BookOpenText, Hash } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Collapsible,
  ConfirmationDialog,
  ErrorState,
  RatingInput,
} from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { CategorySelector } from '@/features/posts/components/CategorySelector';
import { ComposeFooter } from '@/features/posts/components/ComposeFooter';
import { DetailsSection } from '@/features/posts/components/DetailsSection';
import { FormSection } from '@/features/posts/components/FormSection';
import { OptionChips } from '@/features/posts/components/OptionChips';
import { PhotoStrip } from '@/features/posts/components/PhotoStrip';
import { StoryField } from '@/features/posts/components/StoryField';
import { TagInput } from '@/features/posts/components/TagInput';
import { VisibilitySelector } from '@/features/posts/components/VisibilitySelector';
import { usePost, useSavePost } from '@/features/posts/hooks';
import type { SaveProgress, UploadedImage } from '@/features/posts/save';
import {
  emptyPostForm,
  MAX_TAGS,
  normalizeTags,
  postFormSchema,
  postToForm,
  publishSchema,
  type PostFormValues,
} from '@/features/posts/schemas';
import { useTaxonomy } from '@/features/taxonomy/hooks';
import { quickPickFor } from '@/features/taxonomy/taxonomy';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { usePreferencesStore } from '@/stores/preferences';
import { toast } from '@/stores/toast';
import { colors, fonts, HAIRLINE, MAX_FONT_SCALE, SCREEN_GUTTER, spacing } from '@/theme';
import type { Post } from '@/types/models';

export default function ComposeScreen() {
  const { postId: editId } = useLocalSearchParams<{ postId?: string }>();
  const me = useUserId();
  const existing = usePost(editId);
  const defaultVisibility = usePreferencesStore((s) => s.defaultVisibility);

  if (!editId) {
    return <ComposeForm initial={emptyPostForm({ visibility: defaultVisibility })} />;
  }

  // Editing: wait for the full post (not a list placeholder) before building the form.
  const notEditable =
    existing.isError ||
    (existing.isFetched && !existing.data) ||
    (existing.data && existing.data.author.id !== me);
  if (notEditable) {
    return (
      <View style={styles.screen}>
        <AppHeader leading="close" />
        <ErrorState
          error={existing.error}
          title="Can’t edit this post"
          onRetry={() => void existing.refetch()}
        />
      </View>
    );
  }
  if (!existing.data || existing.isPlaceholderData) {
    return (
      <View style={styles.screen}>
        <AppHeader leading="close" />
        <ActivityIndicator color={colors.textTertiary} style={styles.loading} />
      </View>
    );
  }
  return <ComposeForm key={existing.data.id} post={existing.data} initial={postToForm(existing.data)} />;
}

function ComposeForm({ post, initial }: { post?: Post; initial: PostFormValues }) {
  const taxonomy = useTaxonomy();
  const setDefaultVisibility = usePreferencesStore((s) => s.setDefaultVisibility);
  const savePost = useSavePost();

  // New posts get their id up front so photos upload into the post's folder.
  const [postId] = useState(() => post?.id ?? Crypto.randomUUID());
  const uploadCache = useRef(new Map<string, UploadedImage>());
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // Tag text typed but not yet committed; included on submit so it isn't lost.
  const pendingTag = useRef('');

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: initial,
  });
  const { control, formState, setValue, setError, getValues, reset, clearErrors } = form;

  const primaryId = useWatch({ control, name: 'primaryCategoryId' });
  const saving = savePost.isPending;
  const dirty = formState.isDirty;
  const editingPublished = post?.status === 'published';

  const submit = async (status: 'draft' | 'published') => {
    clearErrors();
    const current = getValues();
    const values = pendingTag.current.trim()
      ? {
          ...current,
          tags: normalizeTags([...current.tags, ...pendingTag.current.split(',')]).slice(0, MAX_TAGS),
        }
      : current;
    const parsed = (status === 'published' ? publishSchema : postFormSchema).safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setError(issue.path[0] as FieldPath<PostFormValues>, { message: issue.message });
      }
      haptics.error();
      const first = parsed.error.issues[0]?.path[0];
      if (first === 'title' || first === 'primaryCategoryId' || first === 'images') {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
      return;
    }
    if (!taxonomy.data) return;

    try {
      await savePost.mutateAsync({
        postId,
        values: parsed.data,
        status,
        taxonomy: taxonomy.data,
        previousImages: post?.images,
        uploadCache: uploadCache.current,
        onProgress: setProgress,
      });
      setDefaultVisibility(parsed.data.visibility);
      haptics.success();
      toast.success(
        status === 'draft' ? 'Draft saved' : editingPublished ? 'Changes saved' : 'Logged to your diary',
      );
      reset(parsed.data);
      router.back();
    } catch (error) {
      haptics.error();
      toast.error(toUserMessage(error, 'Couldn’t save. Your entry is still here — try again.'));
    } finally {
      setProgress(null);
    }
  };

  const close = () => (dirty && !saving ? setConfirmDiscard(true) : router.back());

  const tags = useWatch({ control, name: 'tags' });
  const tagsSummary =
    tags.length > 0 ? tags.map((t) => `#${t}`).join('  ') : 'Help friends find it — #sourdough, #weeknight';
  const pick = taxonomy.data ? quickPickFor(taxonomy.data, primaryId || null) : null;
  const title = post ? (post.status === 'draft' ? 'Finish draft' : 'Edit post') : 'New entry';

  return (
    <View style={styles.screen}>
      {/* Block swipe-to-dismiss while there are unsaved changes. */}
      <Stack.Screen options={{ gestureEnabled: !dirty && !saving }} />
      <AppHeader
        title={title}
        leading="close"
        onLeadingPress={close}
        bordered
        right={
          !editingPublished ? (
            <AppText
              variant="calloutStrong"
              color={saving ? 'textTertiary' : 'textSecondary'}
              onPress={saving ? undefined : () => void submit('draft')}
              accessibilityRole="button"
              testID="compose-save-draft"
            >
              Save draft
            </AppText>
          ) : null
        }
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Controller
            control={control}
            name="images"
            render={({ field }) => <PhotoStrip images={field.value} onChange={field.onChange} />}
          />

          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <View style={styles.padded}>
                <TextInput
                  defaultValue={initial.title}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="What did you make?"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={80}
                  returnKeyType="done"
                  submitBehavior="blurAndSubmit"
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  accessibilityLabel="Dish or drink name"
                  style={styles.titleInput}
                  testID="compose-title"
                />
                {fieldState.error ? (
                  <AppText variant="caption" color="danger">
                    {fieldState.error.message}
                  </AppText>
                ) : null}
              </View>
            )}
          />

          {taxonomy.data ? (
            <Controller
              control={control}
              name="primaryCategoryId"
              render={({ field, fieldState }) => (
                <View style={styles.padded}>
                  <CategorySelector
                    primaries={taxonomy.data.primaries}
                    value={field.value}
                    error={fieldState.error?.message}
                    onChange={(id) => {
                      field.onChange(id);
                      setValue('subcategoryId', null, { shouldDirty: true });
                    }}
                  />
                </View>
              )}
            />
          ) : taxonomy.isError ? (
            <ErrorState compact error={taxonomy.error} onRetry={() => void taxonomy.refetch()} />
          ) : null}

          {pick && primaryId ? (
            <Controller
              control={control}
              name={pick.kind === 'subcategory' ? 'subcategoryId' : 'cuisineId'}
              render={({ field }) => (
                <OptionChips
                  label={pick.label}
                  options={pick.options.map((c) => ({ id: c.id, label: c.name }))}
                  value={field.value as string | null}
                  onChange={field.onChange}
                />
              )}
            />
          ) : null}

          <FormSection title="Rating">
            <Controller
              control={control}
              name="rating"
              render={({ field, fieldState }) => (
                <RatingInput
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          </FormSection>

          <FormSection title="Review" hint="Optional">
            <Controller
              control={control}
              name="review"
              render={({ field }) => (
                <TextInput
                  defaultValue={initial.review}
                  onChangeText={field.onChange}
                  placeholder="How did it turn out?"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  maxLength={2000}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  accessibilityLabel="Review"
                  style={styles.reviewInput}
                />
              )}
            />
          </FormSection>

          <View>
            <Collapsible
              title="Story"
              summary={initial.story ? 'Your story so far' : 'The backstory, the process, what went wrong'}
              icon={BookOpenText}
              initiallyOpen={initial.story.length > 0}
              testID="compose-story"
            >
              <Controller
                control={control}
                name="story"
                render={({ field }) => <StoryField initial={initial.story} onChange={field.onChange} />}
              />
            </Collapsible>

            <Collapsible
              title="Tags"
              summary={tagsSummary}
              icon={Hash}
              initiallyOpen={initial.tags.length > 0}
              testID="compose-tags"
            >
              <Controller
                control={control}
                name="tags"
                render={({ field }) => (
                  <TagInput
                    value={field.value}
                    onChange={field.onChange}
                    onDraftChange={(draft) => {
                      pendingTag.current = draft;
                    }}
                  />
                )}
              />
            </Collapsible>

            {taxonomy.data ? (
              <DetailsSection
                control={control}
                taxonomy={taxonomy.data}
                showCuisine={pick?.kind === 'subcategory'}
                initiallyOpen={!!post}
              />
            ) : null}
            <View style={styles.optionalEnd} />
          </View>

          <FormSection title="Who can see this" spaced>
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => <VisibilitySelector value={field.value} onChange={field.onChange} />}
            />
          </FormSection>
        </ScrollView>

        <ComposeFooter
          label={editingPublished ? 'Save changes' : 'Post'}
          saving={saving}
          paused={savePost.isPaused}
          progress={progress}
          onSubmit={() => void submit('published')}
        />
      </KeyboardAvoidingView>

      <ConfirmationDialog
        visible={confirmDiscard}
        title="Discard this entry?"
        message="Your photos and notes won’t be saved. Use Save draft to keep it for later."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          reset();
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { marginTop: spacing.huge },
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  padded: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.xs },
  // Story, Tags and More details read as one ruled list.
  optionalEnd: { height: HAIRLINE, backgroundColor: colors.rule, marginHorizontal: SCREEN_GUTTER },
  titleInput: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  reviewInput: {
    fontFamily: fonts.text,
    fontSize: 16,
    lineHeight: 23,
    color: colors.text,
    minHeight: 64,
    textAlignVertical: 'top',
    paddingTop: 0,
  },
});
