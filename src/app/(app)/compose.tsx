import { zodResolver } from '@hookform/resolvers/zod';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form';
import {
  ActivityIndicator,
  AppState,
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
import {
  clearComposeRecovery,
  hasContent,
  readComposeRecovery,
  readDraftMadeWith,
  refreshRemoteImages,
  withoutMissingLocalPhotos,
  writeComposeRecovery,
  writeDraftMadeWith,
  type ComposeRecovery,
} from '@/features/posts/composeRecovery';
import { DraftsButton } from '@/features/posts/components/DraftsButton';
import { LeaveComposeSheet } from '@/features/posts/components/LeaveComposeSheet';
import { CategorySelector } from '@/features/posts/components/CategorySelector';
import { ComposeFooter } from '@/features/posts/components/ComposeFooter';
import { DetailsSection } from '@/features/posts/components/DetailsSection';
import { BudgetField } from '@/features/posts/components/BudgetField';
import { FormSection } from '@/features/posts/components/FormSection';
import { inviteCollaborators } from '@/features/collaboration/api';
import { MadeWithField } from '@/features/collaboration/components/MadeWithField';
import { ClassificationField } from '@/features/posts/components/ClassificationField';
import { PhotoStrip } from '@/features/posts/components/PhotoStrip';
import { StoryField } from '@/features/posts/components/StoryField';
import { useRevealOnFocus } from '@/hooks/useRevealOnFocus';
import { TagInput } from '@/features/posts/components/TagInput';
import { VisibilitySelector } from '@/features/posts/components/VisibilitySelector';
import { useDrafts, usePost, useSavePost } from '@/features/posts/hooks';
import { MissingPhotoError, type SaveProgress, type UploadedImage } from '@/features/posts/save';
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
import { showRankingMoment } from '@/features/rankings/showRankingMoment';
import { usePushPromptStore } from '@/stores/pushPrompt';
import { toast } from '@/stores/toast';
import { colors, fonts, HAIRLINE, MAX_FONT_SCALE, SCREEN_GUTTER, spacing } from '@/theme';
import type { Post, ProfileSummary } from '@/types/models';

interface ComposeStart {
  /** The on-phone safety copy for this entry, if one is waiting. */
  recovery: ComposeRecovery | null;
  /** "Made with" people remembered for this draft. */
  madeWith: ProfileSummary[];
}

/** Loads what Create needs from this phone before the form is built. */
function useComposeStart(me: string | null | undefined, editId: string | undefined) {
  const [start, setStart] = useState<ComposeStart | null>(null);
  useEffect(() => {
    if (!me) return;
    let active = true;
    void Promise.all([readComposeRecovery(me), editId ? readDraftMadeWith(me, editId) : []]).then(
      ([saved, madeWith]) => {
        const matches =
          saved &&
          hasContent(saved.values) &&
          (editId ? saved.mode === 'edit' && saved.postId === editId : saved.mode === 'new');
        if (active) setStart({ recovery: matches ? saved : null, madeWith });
      },
    );
    return () => {
      active = false;
    };
  }, [me, editId]);
  return start;
}

export default function ComposeScreen() {
  const { postId: editId } = useLocalSearchParams<{ postId?: string }>();
  const me = useUserId();
  const existing = usePost(editId);
  const defaultVisibility = usePreferencesStore((s) => s.defaultVisibility);
  const start = useComposeStart(me, editId);
  const [restored, setRestored] = useState<ComposeRecovery | null>(null);
  const [declined, setDeclined] = useState(false);

  const offer = !restored && !declined ? (start?.recovery ?? null) : null;
  const restore = (recovery: ComposeRecovery) => {
    const { images, missing } = withoutMissingLocalPhotos(
      existing.data ? refreshRemoteImages(recovery.values.images, existing.data.images) : recovery.values.images,
    );
    if (missing > 0) {
      toast.error(
        missing === 1
          ? 'One photo is no longer on this phone. Add it again if you still have it.'
          : `${missing} photos are no longer on this phone. Add them again if you still have them.`,
      );
    }
    setRestored({ ...recovery, values: { ...recovery.values, images } });
  };
  const decline = () => {
    setDeclined(true);
    if (me && start?.recovery) void clearComposeRecovery(me, start.recovery.postId);
  };

  if (!editId) {
    if (!start) return <ComposeLoading />;
    const blank = emptyPostForm({ visibility: defaultVisibility });
    return restored ? (
      <ComposeForm
        key="restored"
        postId={restored.postId}
        baseline={blank}
        initial={restored.values}
        initialMadeWith={restored.madeWith}
        restored
      />
    ) : (
      <ComposeForm
        key="new"
        initial={blank}
        initialMadeWith={[]}
        offer={offer}
        onRestore={restore}
        onDecline={decline}
      />
    );
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
  if (!existing.data || existing.isPlaceholderData || !start) return <ComposeLoading />;
  const baseline = postToForm(existing.data);
  return restored ? (
    <ComposeForm
      key={`${existing.data.id}-restored`}
      post={existing.data}
      baseline={baseline}
      initial={restored.values}
      initialMadeWith={restored.madeWith}
      restored
    />
  ) : (
    <ComposeForm
      key={existing.data.id}
      post={existing.data}
      initial={baseline}
      initialMadeWith={start.madeWith}
      offer={offer}
      onRestore={restore}
      onDecline={decline}
    />
  );
}

function ComposeLoading() {
  return (
    <View style={styles.screen}>
      <AppHeader leading="close" />
      <ActivityIndicator color={colors.textTertiary} style={styles.loading} />
    </View>
  );
}

const photosMissingMessage = (count: number) =>
  count === 1
    ? 'One photo couldn’t be found. Remove it (tap ⋯ on the photo) to post.'
    : `${count} photos couldn’t be found. Remove them (tap ⋯ on each photo) to post.`;

function ComposeForm({
  post,
  postId: givenPostId,
  initial,
  baseline,
  initialMadeWith,
  restored = false,
  offer = null,
  onRestore,
  onDecline,
}: {
  post?: Post;
  /** A restored new entry keeps the id it had. */
  postId?: string;
  /** What the form shows when it opens. */
  initial: PostFormValues;
  /** What counts as "no changes" (defaults to `initial`). */
  baseline?: PostFormValues;
  initialMadeWith: ProfileSummary[];
  /** Opened from the on-phone safety copy: starts with unsaved changes. */
  restored?: boolean;
  offer?: ComposeRecovery | null;
  onRestore?: (recovery: ComposeRecovery) => void;
  onDecline?: () => void;
}) {
  const me = useUserId();
  const taxonomy = useTaxonomy();
  const setDefaultVisibility = usePreferencesStore((s) => s.setDefaultVisibility);
  const savePost = useSavePost();
  const drafts = useDrafts(!post);
  const draftCount = drafts.data?.length ?? 0;
  const navigation = useNavigation();

  // New posts get their id up front so photos upload into the post's folder.
  const [postId] = useState(() => post?.id ?? givenPostId ?? Crypto.randomUUID());
  const uploadCache = useRef(new Map<string, UploadedImage>());
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [madeWith, setMadeWith] = useState<ProfileSummary[]>(initialMadeWith);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const revealOnFocus = useRevealOnFocus(scrollRef);
  // Tag text typed but not yet committed; included on submit so it isn't lost.
  const pendingTag = useRef('');

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: baseline ?? initial,
  });
  const { control, formState, setValue, setError, getValues, reset, clearErrors, subscribe } = form;

  // A restored entry opens with its unsaved changes still counting as changes.
  useEffect(() => {
    if (restored) reset(initial, { keepDefaultValues: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  const primaryId = useWatch({ control, name: 'primaryCategoryId' });
  const customLabels = useWatch({ control, name: 'customLabels' });
  const imagesError = formState.errors.images?.message;
  const saving = savePost.isPending;
  const changed = formState.isDirty || restored || madeWith !== initialMadeWith;
  const editingPublished = post?.status === 'published';

  // --- Safety copy on this phone (survives closing the app or signing out) ---
  const changedRef = useRef(changed);
  const madeWithRef = useRef(madeWith);
  useEffect(() => {
    changedRef.current = changed;
    madeWithRef.current = madeWith;
  });
  const settled = useRef(false); // saved or discarded: nothing left to keep
  const persist = useCallback(() => {
    if (!me || settled.current || !changedRef.current) return;
    void writeComposeRecovery(me, {
      postId,
      mode: post ? 'edit' : 'new',
      values: getValues(),
      madeWith: madeWithRef.current,
      savedAt: Date.now(),
    });
  }, [me, post, postId, getValues]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(persist, 500);
    };
    const unsubscribe = subscribe({ formState: { values: true }, callback: schedule });
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') persist();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
      appState.remove();
      persist(); // closing for any other reason (e.g. signed out) keeps a copy
    };
  }, [subscribe, persist]);
  useEffect(() => {
    if (madeWith !== initialMadeWith) persist();
  }, [madeWith, initialMadeWith, persist]);

  // --- Leaving with unsaved changes always asks first ---
  const [released, setReleased] = useState(false);
  const proceed = useRef<(() => void) | null>(null);
  usePreventRemove(changed && !released, ({ data }) => {
    if (saving) return;
    proceed.current = () => navigation.dispatch(data.action);
    setLeaveOpen(true);
  });
  // Navigation runs once prevention is off (the render after `released`).
  useEffect(() => {
    if (!released) return;
    const go = proceed.current;
    proceed.current = null;
    go?.();
  }, [released]);
  const leaveThen = (go: () => void) => {
    proceed.current = go;
    setReleased(true);
  };
  const openDrafts = () => {
    if (changed) {
      proceed.current = () => router.replace('/drafts');
      setLeaveOpen(true);
    } else {
      router.replace('/drafts');
    }
  };

  // Blocks a second tap synchronously, before `saving` re-renders.
  const submitting = useRef(false);
  const submit = async (status: 'draft' | 'published', then?: () => void) => {
    if (submitting.current) return;
    clearErrors();
    const current = getValues();
    const values = pendingTag.current.trim()
      ? {
          ...current,
          tags: normalizeTags([...current.tags, ...pendingTag.current.split(',')]).slice(0, MAX_TAGS),
        }
      : current;
    const parsed = (status === 'published' ? publishSchema : postFormSchema).safeParse(values);
    // Uploaded photos whose files are gone can stay in a draft, not a post.
    const missingRemote = values.images.filter((image) => image.kind === 'remote' && !image.uri).length;
    if (status === 'published' && missingRemote > 0 && parsed.success) {
      setError('images', { message: photosMissingMessage(missingRemote) });
      haptics.error();
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!parsed.success) {
      setLeaveOpen(false);
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

    submitting.current = true;
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
      // Invitations go out once the creation is published.
      if (status === 'published' && madeWith.length > 0) {
        await inviteCollaborators(
          postId,
          madeWith.map((p) => p.id),
        ).catch((error) =>
          toast.error(
            toUserMessage(error, 'Saved, but the invitations didn’t send. Try again from the post.'),
          ),
        );
      }
      settled.current = true;
      if (me) {
        void clearComposeRecovery(me, postId);
        void writeDraftMadeWith(me, postId, status === 'draft' ? madeWith : []);
      }
      haptics.success();
      toast.success(
        status === 'draft' ? 'Draft saved' : editingPublished ? 'Changes saved' : 'Logged to your diary',
      );
      reset(parsed.data);
      setLeaveOpen(false);
      leaveThen(() => {
        if (then) then();
        else router.back();
        if (status === 'published' && !editingPublished) {
          // Where it landed in their rankings (and an optional comparison);
          // otherwise a good moment to offer notifications (offered once).
          void showRankingMoment(postId, parsed.data.title, parsed.data.rating ?? 0).then((shown) => {
            if (!shown) usePushPromptStore.getState().offerOnce();
          });
        }
      });
    } catch (error) {
      haptics.error();
      setLeaveOpen(false);
      persist();
      if (error instanceof MissingPhotoError) {
        const gone = new Set(error.keys);
        setValue(
          'images',
          getValues('images').filter((image) => !gone.has(image.key)),
          { shouldDirty: true },
        );
        setError('images', { message: error.message });
        toast.error(error.message);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        toast.error(
          toUserMessage(error, 'Couldn’t save. Your entry is still here and kept on this phone — try again.'),
        );
      }
    } finally {
      submitting.current = false;
      setProgress(null);
    }
  };

  // Unsaved changes are caught by usePreventRemove, which asks first.
  const close = () => {
    if (!saving) router.back();
  };
  const discard = () => {
    settled.current = true;
    if (me) void clearComposeRecovery(me, postId);
    setLeaveOpen(false);
    reset();
    leaveThen(proceed.current ?? (() => router.back()));
  };

  const tags = useWatch({ control, name: 'tags' });
  const tagsSummary =
    tags.length > 0 ? tags.map((t) => `#${t}`).join('  ') : 'Help friends find it — #sourdough, #weeknight';
  const pick = taxonomy.data ? quickPickFor(taxonomy.data, primaryId || null) : null;
  const title = post ? (post.status === 'draft' ? 'Finish draft' : 'Edit post') : 'New entry';

  return (
    <View style={styles.screen}>
      {/* Block swipe-to-dismiss while there are unsaved changes. */}
      <Stack.Screen options={{ gestureEnabled: !changed && !saving }} />
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
          onScroll={revealOnFocus.onScroll}
          scrollEventThrottle={32}
        >
          {!post ? <DraftsButton count={draftCount} onPress={openDrafts} /> : null}

          <Controller
            control={control}
            name="images"
            render={({ field }) => (
              <PhotoStrip
                images={field.value}
                onChange={(images) => {
                  field.onChange(images);
                  if (imagesError) clearErrors('images');
                }}
              />
            )}
          />
          {imagesError ? (
            <AppText variant="caption" color="danger" style={styles.padded} accessibilityLiveRegion="polite">
              {imagesError}
            </AppText>
          ) : null}

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
                      setValue('subcategoryIds', [], { shouldDirty: true });
                      // Custom subtypes belong to the old category.
                      setValue(
                        'customLabels',
                        getValues('customLabels').filter((c) => c.kind !== 'subcategory'),
                        { shouldDirty: true },
                      );
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
              name={pick.kind === 'subcategory' ? 'subcategoryIds' : 'cuisineIds'}
              render={({ field }) => (
                <ClassificationField
                  label={pick.kind === 'subcategory' ? pick.label : 'Cuisines'}
                  kind={pick.kind}
                  parentId={primaryId}
                  taxonomy={taxonomy.data!}
                  value={field.value}
                  onChange={field.onChange}
                  customLabels={customLabels}
                  onCustomLabelsChange={(labels) => setValue('customLabels', labels, { shouldDirty: true })}
                  display={pick.kind === 'subcategory' ? 'all' : 'common'}
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

          <Controller
            control={control}
            name="isBudget"
            render={({ field }) => (
              <Controller
                control={control}
                name="budgetCost"
                render={({ field: cost, fieldState }) => (
                  <BudgetField
                    enabled={field.value}
                    onToggle={field.onChange}
                    defaultCost={initial.budgetCost}
                    onCostChange={cost.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
            )}
          />

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
                render={({ field }) => (
                  <StoryField
                    initial={field.value}
                    onChange={field.onChange}
                    onFocus={revealOnFocus.reveal}
                  />
                )}
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

            {!editingPublished ? <MadeWithField people={madeWith} onChange={setMadeWith} /> : null}

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
          loadingLabel={editingPublished ? 'Saving…' : 'Posting…'}
          saving={saving}
          paused={savePost.isPaused}
          progress={progress}
          onSubmit={() => void submit('published')}
        />
      </KeyboardAvoidingView>

      <LeaveComposeSheet
        visible={leaveOpen}
        canSaveDraft={!editingPublished}
        // Offline, a save waits for the connection; don't trap them in the sheet.
        saving={saving && !savePost.isPaused}
        onSaveDraft={() => void submit('draft', proceed.current ?? undefined)}
        onDiscard={discard}
        onCancel={() => {
          proceed.current = null;
          setLeaveOpen(false);
        }}
      />

      <ConfirmationDialog
        visible={!!offer}
        title="Pick up where you left off?"
        message={
          offer
            ? `“${offer.values.title.trim() || 'Untitled entry'}” wasn’t saved before Cheffy closed. It’s been kept on this phone.`
            : undefined
        }
        confirmLabel="Restore it"
        cancelLabel="Start fresh"
        onConfirm={() => {
          if (offer) onRestore?.(offer);
        }}
        onCancel={() => onDecline?.()}
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
