import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';

export interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** After the sheet has finished closing (safe moment to navigate or sign out). */
  onClosed?: () => void;
  /** Shown inside the sheet (a toast would be hidden behind it on iOS). */
  error?: string | null;
}

/** Sheet-styled confirmation for consequential actions (delete, block, sign out). */
export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  onClosed,
  error = null,
}: ConfirmationDialogProps) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onCancel}
      onClosed={onClosed}
      accessibilityLabel={title}
    >
      <View style={styles.body}>
        <AppText variant="title2" align="center">
          {title}
        </AppText>
        {message ? (
          <AppText variant="callout" color="textSecondary" align="center">
            {message}
          </AppText>
        ) : null}
        {error ? (
          <AppText variant="callout" color="danger" align="center" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}
      </View>
      <View style={styles.actions}>
        <AppButton
          label={confirmLabel}
          variant={destructive ? 'destructive' : 'primary'}
          onPress={handleConfirm}
          loading={busy}
          fullWidth
          testID="confirm-dialog-confirm"
        />
        <AppButton label={cancelLabel} variant="ghost" onPress={onCancel} disabled={busy} fullWidth />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  actions: { gap: spacing.xs },
});
