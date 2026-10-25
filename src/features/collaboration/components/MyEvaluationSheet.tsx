import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppButton, AppText, BottomSheet, KeyboardDoneBar, RatingInput } from '@/components/ui';
import { colors, fonts, HAIRLINE, MAX_FONT_SCALE, radii, spacing } from '@/theme';

import { useSetMyEvaluation } from '../hooks';

export interface MyEvaluationSheetProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  title: string;
  initialRating: number | null;
  initialReview: string;
}

/**
 * A co-creator's own rating and review of a shared creation. It counts in
 * their rankings only and never changes anyone else's.
 *
 * Keyboard: "Done" above it, a tap on any blank part of the sheet or the
 * backdrop, or dragging the form down hides it. None of these close the sheet
 * or lose the review, and Save stays pinned above the keyboard.
 */
export function MyEvaluationSheet({
  visible,
  onClose,
  postId,
  title,
  initialRating,
  initialReview,
}: MyEvaluationSheetProps) {
  const [rating, setRating] = useState<number | null>(initialRating);
  // A blank saved review (e.g. a stray Return) starts empty, so the placeholder shows.
  const startReview = initialReview.trim() ? initialReview : '';
  const [review, setReview] = useState(startReview);
  const save = useSetMyEvaluation();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Your rating"
      accessibilityLabel="Your rating"
      dragFromHandleOnly
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <Pressable onPress={Keyboard.dismiss} accessible={false} style={styles.body}>
          <AppText variant="callout" color="textSecondary">
            How did <AppText variant="calloutStrong">{title}</AppText> turn out for you? This is yours alone —
            it goes into your rankings, not anyone else’s.
          </AppText>
          <RatingInput value={rating} onChange={setRating} />
          <TextInput
            defaultValue={startReview}
            onChangeText={setReview}
            placeholder="Your review (optional)"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={2000}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            accessibilityLabel="Your review"
            style={styles.review}
          />
        </Pressable>
      </ScrollView>
      <KeyboardDoneBar />
      <View style={styles.footer}>
        <AppButton
          label="Save my rating"
          fullWidth
          disabled={rating === null}
          loading={save.isPending}
          onPress={() => {
            if (rating === null) return;
            Keyboard.dismiss();
            save.mutate({ postId, rating, review: review.trim() }, { onSuccess: onClose });
          }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  body: { gap: spacing.lg, paddingBottom: spacing.lg },
  footer: { paddingTop: spacing.xs },
  review: {
    minHeight: 72,
    maxHeight: 160,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontFamily: fonts.text,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
