import { Check, Plus, Search, X } from 'lucide-react-native';
import { useDeferredValue, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Chip } from '@/components/ui';
import { canAddCustom, commonFirst, normalizeLabel, searchOptions } from '@/features/taxonomy/taxonomy';
import { haptics } from '@/lib/haptics';
import {
  colors,
  fonts,
  HAIRLINE,
  iconSizes,
  MAX_FONT_SCALE,
  radii,
  SCREEN_GUTTER,
  spacing,
  strokes,
} from '@/theme';
import type { Category } from '@/types/models';

export interface ClassificationPickerProps {
  visible: boolean;
  onClose: () => void;
  /** e.g. "Cuisines" or "What kind of baking?" */
  title: string;
  /** Every choice, built-in and custom, for this kind. */
  options: Category[];
  usage: Readonly<Record<string, number>>;
  selectedIds: string[];
  /** New labels typed this session (not yet saved). */
  pendingLabels: string[];
  onChange: (ids: string[], pendingLabels: string[]) => void;
  allowCustom?: boolean;
  /** Retired choices this post already has (shown as selected, removable). */
  kept?: Category[];
  /** Retired choices for this list: never offered, and can't be re-added by typing. */
  retired?: Category[];
}

type Row =
  | { type: 'heading'; key: string; label: string }
  | { type: 'option'; key: string; option: Category }
  | { type: 'add'; key: string; label: string }
  | { type: 'note'; key: string; label: string };

/**
 * Searchable multi-select for cuisines and subtypes: common choices first,
 * the full list A–Z, and "Add …" for anything missing (normalized so it
 * never duplicates an existing label). A native page sheet, so the keyboard
 * and swipe-to-dismiss behave like iOS.
 */
export function ClassificationPicker({
  visible,
  onClose,
  title,
  options,
  usage,
  selectedIds,
  pendingLabels,
  onChange,
  allowCustom = true,
  kept = [],
  retired = [],
}: ClassificationPickerProps) {
  const insets = useSafeAreaInsets();
  // Uncontrolled field (native owns the text, so fast typing never drops
  // keys); the list filters on a deferred copy so typing stays responsive.
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [typed, setTyped] = useState('');
  const query = useDeferredValue(typed);
  const setQuery = (text: string) => {
    if (text === '') input.current?.clear();
    setTyped(text);
  };
  const selected = new Set(selectedIds);

  const rows = useMemo<Row[]>(() => {
    const builtIns = options.filter((o) => !o.isCustom);
    if (query.trim()) {
      const results = searchOptions(options, query).map((option) => ({
        type: 'option' as const,
        key: option.id,
        option,
      }));
      const pendingMatch = pendingLabels.some((l) => normalizeLabel(l) === normalizeLabel(query));
      const add =
        allowCustom && !pendingMatch && canAddCustom([...options, ...retired], query)
          ? [{ type: 'add' as const, key: 'add', label: query.trim().replace(/\s+/g, ' ') }]
          : [];
      const gone = retired.find((r) => r.slug === normalizeLabel(query));
      const note = gone
        ? [{ type: 'note' as const, key: 'note', label: `${gone.name} isn’t offered here any more.` }]
        : [];
      // Existing matches first, so picking beats creating a near-duplicate.
      return [...results, ...add, ...note];
    }
    const common = commonFirst(builtIns, usage, 8);
    return [
      { type: 'heading', key: 'h-common', label: 'Common' },
      ...common.map((option) => ({ type: 'option' as const, key: `c-${option.id}`, option })),
      { type: 'heading', key: 'h-all', label: 'All' },
      ...searchOptions(builtIns, '').map((option) => ({ type: 'option' as const, key: option.id, option })),
    ];
  }, [options, usage, query, pendingLabels, allowCustom, retired]);

  const toggle = (id: string) => {
    haptics.selection();
    onChange(selected.has(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id], pendingLabels);
  };
  const addCustom = (label: string) => {
    haptics.selection();
    onChange(selectedIds, [...pendingLabels, label]);
    setQuery('');
  };
  const byId = Object.fromEntries([...options, ...kept].map((o) => [o.id, o]));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <AppText variant="title3" accessibilityRole="header">
            {title}
          </AppText>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Done">
            <AppText variant="calloutStrong" color="accent">
              Done
            </AppText>
          </Pressable>
        </View>

        <View style={styles.search}>
          <Search size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
          <TextInput
            ref={input}
            onChangeText={setTyped}
            placeholder={allowCustom ? 'Search, or type to add your own' : 'Search'}
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
            returnKeyType="done"
            maxLength={30}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            accessibilityLabel={`Search ${title.toLowerCase()}`}
            style={styles.searchInput}
          />
          {typed ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <X size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
            </Pressable>
          ) : null}
        </View>

        {selectedIds.length + pendingLabels.length > 0 ? (
          <View style={styles.selected}>
            {selectedIds.map((id) =>
              byId[id] ? (
                <Chip key={id} label={byId[id]!.name} size="sm" selected onRemove={() => toggle(id)} />
              ) : null,
            )}
            {pendingLabels.map((label) => (
              <Chip
                key={`new-${label}`}
                label={label}
                size="sm"
                selected
                onRemove={() =>
                  onChange(
                    selectedIds,
                    pendingLabels.filter((l) => l !== label),
                  )
                }
              />
            ))}
          </View>
        ) : null}

        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => {
            if (item.type === 'heading') {
              return (
                <AppText variant="overline" color="textSecondary" style={styles.heading}>
                  {item.label}
                </AppText>
              );
            }
            if (item.type === 'note') {
              return (
                <AppText variant="callout" color="textSecondary" style={styles.heading}>
                  {item.label}
                </AppText>
              );
            }
            if (item.type === 'add') {
              return (
                <Pressable
                  onPress={() => addCustom(item.label)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.label}`}
                >
                  <Plus size={iconSizes.md} color={colors.accent} strokeWidth={strokes.bold} />
                  <AppText variant="body" style={styles.flex}>
                    Add “<AppText variant="bodyStrong">{item.label}</AppText>”
                  </AppText>
                </Pressable>
              );
            }
            const on = selected.has(item.option.id);
            return (
              <Pressable
                onPress={() => toggle(item.option.id)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={item.option.name}
              >
                <AppText variant="body" style={[styles.flex, on && styles.on]}>
                  {item.option.name}
                </AppText>
                {on ? <Check size={iconSizes.md} color={colors.accent} strokeWidth={strokes.bold} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <AppText variant="callout" color="textSecondary" style={styles.empty}>
              Nothing matches.
            </AppText>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: SCREEN_GUTTER,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontFamily: fonts.text, fontSize: 16, color: colors.text, paddingVertical: 0 },
  selected: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.md,
  },
  heading: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: SCREEN_GUTTER,
    borderBottomWidth: HAIRLINE,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.tint },
  flex: { flex: 1 },
  on: { fontFamily: fonts.textSemiBold, color: colors.accent },
  empty: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.lg },
});
