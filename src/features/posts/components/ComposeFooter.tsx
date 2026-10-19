import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppText } from '@/components/ui';
import { colors, HAIRLINE, SCREEN_GUTTER, spacing } from '@/theme';

import type { SaveProgress } from '../save';

export interface ComposeFooterProps {
  label: string;
  saving: boolean;
  /** The save is queued because the device is offline. */
  paused: boolean;
  progress: SaveProgress | null;
  onSubmit: () => void;
}

/** Pinned submit bar for Create, with upload progress or an offline notice. */
export function ComposeFooter({ label, saving, paused, progress, onSubmit }: ComposeFooterProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {paused ? (
        <AppText variant="caption" color="textSecondary" align="center" accessibilityLiveRegion="polite">
          Waiting for a connection… your post will save when you’re back online.
        </AppText>
      ) : progress ? (
        <SaveProgressBar progress={progress} />
      ) : null}
      <AppButton label={label} size="lg" fullWidth loading={saving} onPress={onSubmit} testID="compose-submit" />
    </View>
  );
}

export function progressLabel(progress: SaveProgress): string {
  if (progress.stage === 'saving') return 'Saving…';
  return `Uploading photo ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`;
}

function SaveProgressBar({ progress }: { progress: SaveProgress }) {
  const fraction = progress.total === 0 ? 1 : progress.done / progress.total;
  const label = progressLabel(progress);
  return (
    <View style={styles.progress} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.border,
  },
  progress: { gap: spacing.xs },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent },
});
