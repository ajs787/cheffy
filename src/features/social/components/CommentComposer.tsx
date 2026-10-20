import { useState, type ComponentRef, type RefObject } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Avatar } from '@/components/ui';
import { useMyProfile } from '@/features/profile/hooks';
import { colors, fonts, HAIRLINE, MAX_FONT_SCALE, SCREEN_GUTTER, spacing } from '@/theme';

import { useAddComment } from '../hooks';

const MAX_COMMENT = 1000;

export interface CommentComposerProps {
  postId: string;
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  autoFocus?: boolean;
}

/** The "Add a comment…" bar pinned under a post's comments. */
export function CommentComposer({ postId, inputRef, autoFocus = false }: CommentComposerProps) {
  const insets = useSafeAreaInsets();
  const { data: me } = useMyProfile();
  const addComment = useAddComment(postId);
  // Uncontrolled: the native field owns the text so fast typing never drops keys.
  const [body, setBody] = useState('');
  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_COMMENT;

  const send = () => {
    if (!canSend) return;
    addComment.mutate(body);
    inputRef.current?.clear();
    setBody('');
  };

  return (
    <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <Avatar uri={me?.avatarUrl} name={me?.displayName ?? ''} size="sm" />
      <TextInput
        ref={inputRef}
        onChangeText={setBody}
        placeholder="Add a comment…"
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={MAX_COMMENT}
        autoFocus={autoFocus}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        accessibilityLabel="Write a comment"
        style={styles.input}
        testID="comment-input"
      />
      <Pressable
        onPress={send}
        disabled={!canSend}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Post comment"
        accessibilityState={{ disabled: !canSend }}
        testID="comment-send"
      >
        <AppText variant="calloutStrong" color={canSend ? 'accentStrong' : 'textTertiary'}>
          Post
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm,
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    fontFamily: fonts.text,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
});
