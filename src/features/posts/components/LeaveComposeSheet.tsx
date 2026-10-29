import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, BottomSheet } from '@/components/ui';
import { spacing } from '@/theme';

/**
 * Asked whenever Create would close with unsaved changes (close button,
 * swipe, Android back, opening Drafts). Saving as a draft is the first choice.
 */
export function LeaveComposeSheet({
  visible,
  canSaveDraft,
  saving,
  onSaveDraft,
  onDiscard,
  onCancel,
}: {
  visible: boolean;
  /** False when editing a published post (a draft would unpublish it). */
  canSaveDraft: boolean;
  saving: boolean;
  onSaveDraft: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={saving ? () => undefined : onCancel}
      accessibilityLabel={canSaveDraft ? 'Save this entry as a draft?' : 'Discard your changes?'}
    >
      <View style={styles.body}>
        <AppText variant="title2" align="center">
          {canSaveDraft ? 'Save this entry as a draft?' : 'Discard your changes?'}
        </AppText>
        <AppText variant="callout" color="textSecondary" align="center">
          {canSaveDraft
            ? 'Drafts keep your photos and notes. Find them under Drafts on Create.'
            : 'Your edits to this post won’t be saved.'}
        </AppText>
      </View>
      <View style={styles.actions}>
        {canSaveDraft ? (
          <AppButton
            label="Save draft"
            onPress={onSaveDraft}
            loading={saving}
            fullWidth
            testID="leave-save-draft"
          />
        ) : null}
        <AppButton
          label="Discard"
          variant={canSaveDraft ? 'secondary' : 'destructive'}
          onPress={onDiscard}
          disabled={saving}
          fullWidth
          testID="leave-discard"
        />
        <AppButton label="Keep editing" variant="ghost" onPress={onCancel} disabled={saving} fullWidth />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  actions: { gap: spacing.xs },
});
