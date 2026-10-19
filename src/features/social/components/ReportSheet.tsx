import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppInput, AppText, BottomSheet, Chip } from '@/components/ui';
import { spacing } from '@/theme';
import type { ReportReason, ReportTarget } from '@/types/models';

import { useReport } from '../hooks';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'not_homemade', label: 'Not homemade' },
  { value: 'intellectual_property', label: 'Stolen content' },
  { value: 'other', label: 'Something else' },
];

export interface ReportSheetProps {
  target: ReportTarget | null;
  onClose: () => void;
}

export function ReportSheet({ target, onClose }: ReportSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const report = useReport();

  const close = () => {
    setReason(null);
    setDetails('');
    onClose();
  };

  const noun = target?.type === 'user' ? 'account' : target?.type === 'comment' ? 'comment' : 'post';

  return (
    <BottomSheet visible={!!target} onClose={close} title={`Report ${noun}`}>
      <AppText variant="callout" color="textSecondary" style={styles.intro}>
        Reports are anonymous. What’s wrong with this {noun}?
      </AppText>
      <View style={styles.reasons}>
        {REASONS.map((r) => (
          <Chip key={r.value} label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
        ))}
      </View>
      <AppInput
        placeholder="Add details (optional)"
        value={details}
        onChangeText={setDetails}
        maxLength={500}
        multiline
        containerStyle={styles.details}
        inputStyle={styles.detailsInput}
      />
      <AppButton
        label="Send report"
        fullWidth
        disabled={!reason}
        loading={report.isPending}
        onPress={() => {
          if (!target || !reason) return;
          report.mutate({ target, reason, details }, { onSuccess: close });
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.md },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  details: { marginBottom: spacing.lg },
  detailsInput: { minHeight: 72 },
});
