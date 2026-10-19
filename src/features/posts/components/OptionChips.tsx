import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Chip } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';

export interface Option {
  id: string;
  label: string;
}

export interface OptionChipsProps {
  label?: string;
  options: Option[];
  value: string | null;
  /** Tapping the selected chip clears it. */
  onChange: (id: string | null) => void;
  /** Horizontal scroller (default) or wrapping rows. */
  layout?: 'scroll' | 'wrap';
}

/** Single-select chip row for optional classifications. */
export function OptionChips({ label, options, value, onChange, layout = 'scroll' }: OptionChipsProps) {
  const chips = options.map((option) => (
    <Chip
      key={option.id}
      label={option.label}
      selected={option.id === value}
      onPress={() => onChange(option.id === value ? null : option.id)}
    />
  ));
  return (
    <View style={styles.container}>
      {label ? (
        <AppText variant="overline" color="textSecondary" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      {layout === 'scroll' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {chips}
        </ScrollView>
      ) : (
        <View style={styles.wrap}>{chips}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: { paddingHorizontal: SCREEN_GUTTER },
  scroll: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: SCREEN_GUTTER },
});
