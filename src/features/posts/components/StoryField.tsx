import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fonts, HAIRLINE, MAX_FONT_SCALE, radii, SCREEN_GUTTER, spacing } from '@/theme';

export const MAX_STORY = 10_000;

export interface StoryFieldProps {
  /** Text to start from: the form's current story, so reopening keeps it. */
  initial: string;
  onChange: (story: string) => void;
  /** Lets the form scroll the field above the keyboard. */
  onFocus?: (field: ComponentRef<typeof TextInput> | null) => void;
}

/**
 * The entry's long-form story, like a post body: the backstory, the process,
 * what went wrong. Lives inside a Collapsible so quick logging stays quick.
 *
 * Grows with the text up to about a third of the screen, then scrolls inside
 * itself; iOS keeps the caret in view while it does.
 */
export function StoryField({ initial, onChange, onFocus }: StoryFieldProps) {
  const [length, setLength] = useState(initial.length);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const { height } = useWindowDimensions();
  const maxHeight = Math.round(Math.min(320, Math.max(200, height * 0.32)));

  return (
    <View style={styles.editor}>
      {/* Uncontrolled: the native field owns the text so long typing never drops keys. */}
      <TextInput
        ref={input}
        defaultValue={initial}
        onFocus={() => onFocus?.(input.current)}
        onChangeText={(text) => {
          setLength(text.length);
          onChange(text);
        }}
        autoFocus={initial.length === 0}
        placeholder={'It started with a craving…\n\nWhat you tried, what surprised you, what you’d change.'}
        placeholderTextColor={colors.textTertiary}
        multiline
        scrollEnabled
        maxLength={MAX_STORY}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        accessibilityLabel="Story"
        style={[styles.input, { maxHeight }]}
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
