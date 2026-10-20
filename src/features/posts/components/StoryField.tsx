import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fonts, HAIRLINE, MAX_FONT_SCALE, radii, SCREEN_GUTTER, spacing } from '@/theme';

export const MAX_STORY = 10_000;

export interface StoryFieldProps {
  /** Starting text (editing an existing entry). */
  initial: string;
  onChange: (story: string) => void;
}

/**
 * The entry's long-form story, like a post body: the backstory, the process,
 * what went wrong. Lives inside a Collapsible so quick logging stays quick.
 */
export function StoryField({ initial, onChange }: StoryFieldProps) {
  const [length, setLength] = useState(initial.length);

  return (
    <View style={styles.editor}>
      {/* Uncontrolled: the native field owns the text so long typing never drops keys. */}
      <TextInput
        defaultValue={initial}
        onChangeText={(text) => {
          setLength(text.length);
          onChange(text);
        }}
        autoFocus={initial.length === 0}
        placeholder={'It started with a craving…\n\nWhat you tried, what surprised you, what you’d change.'}
        placeholderTextColor={colors.textTertiary}
        multiline
        scrollEnabled={false}
        maxLength={MAX_STORY}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        accessibilityLabel="Story"
        style={styles.input}
      />
      <AppText variant="caption" color="textTertiary" align="right">
        {length.toLocaleString()}/{MAX_STORY.toLocaleString()}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.xs },
  input: {
    minHeight: 160,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontFamily: fonts.text,
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
