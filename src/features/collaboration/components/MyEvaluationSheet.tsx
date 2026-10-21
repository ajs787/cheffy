import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppButton, AppText, BottomSheet, RatingInput } from '@/components/ui';
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
  const [review, setReview] = useState(initialReview);
  const save = useSetMyEvaluation();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Your rating" accessibilityLabel="Your rating">
      <View style={styles.body}>
        <AppText variant="callout" color="textSecondary">
          How did <AppText variant="calloutStrong">{title}</AppText> turn out for you? This is yours alone —
          it goes into your rankings, not anyone else’s.
        </AppText>
        <RatingInput value={rating} onChange={setRating} />
        <TextInput
          defaultValue={initialReview}
          onChangeText={setReview}
          placeholder="Your review (optional)"
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={2000}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          accessibilityLabel="Your review"
          style={styles.review}
        />
        <AppButton
          label="Save my rating"
          fullWidth
          disabled={rating === null}
          loading={save.isPending}
          onPress={() => {
            if (rating === null) return;
            save.mutate({ postId, rating, review }, { onSuccess: onClose });
          }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
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
