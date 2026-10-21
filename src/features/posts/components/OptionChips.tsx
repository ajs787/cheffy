import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Chip } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';

export interface Option {
  id: string;
  label: string;
}

interface BaseProps {
  label?: string;
  options: Option[];
  /** Horizontal scroller (default) or wrapping rows. */
  layout?: 'scroll' | 'wrap';
}

interface SingleProps extends BaseProps {
  multiple?: false;
  value: string | null;
  /** Tapping the selected chip clears it. */
  onChange: (id: string | null) => void;
}

interface MultipleProps extends BaseProps {
  multiple: true;
  /** Selected ids, in the order they were picked. */
  value: string[];
  onChange: (ids: string[]) => void;
}

export type OptionChipsProps = SingleProps | MultipleProps;

/** Toggles `id` in an ordered selection (pure, for testing). */
export function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

/**
 * Chip row for optional classifications. `multiple` lets several apply at
 * once (Korean + Italian) and marks picks with a check.
 */
export function OptionChips(props: OptionChipsProps) {
  const { label, options, layout = 'scroll' } = props;
  const isSelected = (id: string) => (props.multiple ? props.value.includes(id) : props.value === id);
  const press = (id: string) => {
    if (props.multiple) props.onChange(toggleId(props.value, id));
    else props.onChange(props.value === id ? null : id);
  };
  const count = props.multiple ? props.value.length : 0;

  const chips = options.map((option) => (
    <Chip
      key={option.id}
      label={option.label}
      selected={isSelected(option.id)}
      checkable={props.multiple}
      onPress={() => press(option.id)}
    />
  ));
  return (
    <View style={styles.container}>
      {label ? (
        <View style={styles.labelRow}>
          <AppText variant="overline" color="textSecondary">
            {label}
          </AppText>
          {props.multiple ? (
            <AppText variant="caption" color="textTertiary">
              {count > 0 ? `${count} selected` : 'Pick any that apply'}
            </AppText>
          ) : null}
        </View>
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
  },
  scroll: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: SCREEN_GUTTER },
});
