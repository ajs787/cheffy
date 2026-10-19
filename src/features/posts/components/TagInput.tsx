import { useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Chip } from '@/components/ui';
import { useTagSearch } from '@/features/discover/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { colors, fonts, MAX_FONT_SCALE, radii, SCREEN_GUTTER, spacing } from '@/theme';
import { slugifyTag } from '@/utils/format';

import { MAX_TAGS, normalizeTags } from '../schemas';

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Text typed but not yet turned into a tag, so a submit can include it. */
  onDraftChange?: (draft: string) => void;
}

/** Free-form tags: type one and press return; suggestions come from existing tags. */
export function TagInput({ value, onChange, onDraftChange }: TagInputProps) {
  const [draft, setDraftState] = useState('');
  const setDraft = (text: string) => {
    setDraftState(text);
    onDraftChange?.(text);
  };
  const debounced = useDebouncedValue(draft, 200);
  const suggestions = useTagSearch(debounced);
  const existing = new Set(value.map(slugifyTag));
  const full = value.length >= MAX_TAGS;

  // The field is uncontrolled (the native input owns its text) so fast typing
  // never loses keystrokes; committing a tag clears it natively.
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const commit = (parts: string[]) => {
    const next = normalizeTags([...value, ...parts]);
    if (next.length > value.length) onChange(next.slice(0, MAX_TAGS));
    inputRef.current?.clear();
    setDraft('');
  };

  const visibleSuggestions = (suggestions.data ?? []).filter((t) => !existing.has(t.slug)).slice(0, 8);

  return (
    <View style={styles.container}>
      <View style={styles.box}>
        {value.map((tag) => (
          <Chip key={tag} label={`#${tag}`} size="sm" onRemove={() => onChange(value.filter((t) => t !== tag))} />
        ))}
        {!full ? (
          <TextInput
            ref={inputRef}
            onChangeText={setDraft}
            // Commit only at a pause (return, blur, suggestion, Post). Splitting
            // on a typed comma raced in-flight keystrokes and garbled tags.
            onSubmitEditing={() => commit(draft.split(','))}
            onBlur={() => {
              if (draft.trim()) commit(draft.split(','));
            }}
            blurOnSubmit={false}
            returnKeyType="done"
            placeholder={value.length === 0 ? 'Type a tag, then return' : 'Add another'}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            accessibilityLabel="Add a tag"
            style={styles.input}
          />
        ) : null}
      </View>
      {draft.trim().length > 0 && visibleSuggestions.length > 0 ? (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestions}
        >
          {visibleSuggestions.map((tag) => (
            <Chip key={tag.id} label={`#${tag.name}`} size="sm" onPress={() => commit([tag.name])} />
          ))}
        </ScrollView>
      ) : null}
      <AppText variant="caption" color="textTertiary" style={styles.hint}>
        {value.length}/{MAX_TAGS} tags
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  box: {
    marginHorizontal: SCREEN_GUTTER,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flexGrow: 1,
    minWidth: 120,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  suggestions: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.xs + 2 },
  hint: { paddingHorizontal: SCREEN_GUTTER },
});
