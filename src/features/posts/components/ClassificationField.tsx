import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Chip } from '@/components/ui';
import { toggleId } from '@/features/posts/components/OptionChips';
import { useClassificationUsage } from '@/features/taxonomy/hooks';
import { commonFirst } from '@/features/taxonomy/taxonomy';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { Category, Taxonomy } from '@/types/models';

import type { CustomKind, CustomLabel } from '../schemas';
import { ClassificationPicker } from './ClassificationPicker';

export interface ClassificationFieldProps {
  label: string;
  kind: CustomKind;
  /** For subtypes: the primary category they belong to. */
  parentId?: string | null;
  taxonomy: Taxonomy;
  value: string[];
  onChange: (ids: string[]) => void;
  /** All pending custom labels in the form; this field edits its own kind's. */
  customLabels: CustomLabel[];
  onCustomLabelsChange: (labels: CustomLabel[]) => void;
  /** 'all': every built-in as a chip (short lists). 'common': top picks + "All…". */
  display?: 'all' | 'common';
}

/** Built-in + custom choices for a kind (and subtype parent). */
export function optionsFor(taxonomy: Taxonomy, kind: CustomKind, parentId?: string | null): Category[] {
  const builtIn =
    kind === 'subcategory'
      ? (taxonomy.subcategoriesByPrimary[parentId ?? ''] ?? [])
      : kind === 'cuisine'
        ? taxonomy.cuisines
        : taxonomy.dishTypes;
  const custom = taxonomy.custom.filter(
    (c) => c.kind === kind && (kind !== 'subcategory' || c.parentId === parentId),
  );
  return [...builtIn, ...custom];
}

/** Retired choices of the same kind (and subtype parent), e.g. Baking › Pizza. */
export function retiredFor(taxonomy: Taxonomy, kind: CustomKind, parentId?: string | null): Category[] {
  return taxonomy.retired.filter(
    (c) => c.kind === kind && (kind !== 'subcategory' || c.parentId === parentId),
  );
}

/**
 * Multi-select classification row: quick chips for what people pick most,
 * plus a searchable sheet with "Add your own".
 */
export function ClassificationField({
  label,
  kind,
  parentId = null,
  taxonomy,
  value,
  onChange,
  customLabels,
  onCustomLabelsChange,
  display = 'common',
}: ClassificationFieldProps) {
  const [open, setOpen] = useState(false);
  const usage = useClassificationUsage(kind).data ?? {};
  const options = optionsFor(taxonomy, kind, parentId);
  const retired = retiredFor(taxonomy, kind, parentId);
  // A post that already uses a retired choice keeps showing it until removed.
  const keptRetired = retired.filter((o) => value.includes(o.id));
  const mine = customLabels.filter((c) => c.kind === kind).map((c) => c.label);
  const others = customLabels.filter((c) => c.kind !== kind);

  const quick =
    display === 'all'
      ? options.filter((o) => !o.isCustom && o.slug !== 'other')
      : commonFirst(
          options.filter((o) => !o.isCustom),
          usage,
          6,
        );
  // Selected choices always show, even when they aren't quick picks.
  const shown = [
    ...quick,
    ...options.filter((o) => value.includes(o.id) && !quick.includes(o)),
    ...keptRetired,
  ];
  const count = value.length + mine.length;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <AppText variant="overline" color="textSecondary">
          {label}
        </AppText>
        <AppText variant="caption" color="textTertiary">
          {count > 0 ? `${count} selected` : 'Pick any that apply'}
        </AppText>
      </View>
      <View style={styles.chips}>
        {shown.map((option) => (
          <Chip
            key={option.id}
            label={option.name}
            selected={value.includes(option.id)}
            checkable
            onPress={() => onChange(toggleId(value, option.id))}
          />
        ))}
        {mine.map((custom) => (
          <Chip
            key={`custom-${custom}`}
            label={custom}
            selected
            checkable
            onPress={() =>
              onCustomLabelsChange([
                ...others,
                ...customLabels.filter((c) => c.kind === kind && c.label !== custom),
              ])
            }
          />
        ))}
        <Chip
          label={display === 'all' ? 'Other…' : `All ${label.toLowerCase()}…`}
          onPress={() => setOpen(true)}
          accessibilityHint="Search the full list or add your own"
        />
      </View>
      <ClassificationPicker
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        options={options}
        kept={keptRetired}
        retired={retired}
        usage={usage}
        selectedIds={value}
        pendingLabels={mine}
        onChange={(ids, labels) => {
          onChange(ids);
          onCustomLabelsChange([...others, ...labels.map((l) => ({ kind, label: l }))]);
        }}
      />
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: SCREEN_GUTTER },
});
