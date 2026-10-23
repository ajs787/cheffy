import { useRef, useState, type ComponentRef, type RefObject } from 'react';
import { X } from 'lucide-react-native';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Avatar } from '@/components/ui';
import { useMyProfile } from '@/features/profile/hooks';
import { colors, fonts, HAIRLINE, iconSizes, MAX_FONT_SCALE, SCREEN_GUTTER, spacing, strokes } from '@/theme';

import type { ReplyTarget } from '../api';

import { useAddComment } from '../hooks';

const MAX_COMMENT = 1000;

export interface CommentComposerProps {
  postId: string;
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  autoFocus?: boolean;
  /** Set when replying: shown above the field and attached to the comment. */
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  /** Called after sending (e.g. to open the thread). */
  onSent?: (reply: ReplyTarget | null) => void;
}

/** The "Add a comment…" bar pinned under a post's comments; also writes replies. */
export function CommentComposer({
  postId,
  inputRef,
  autoFocus = false,
  replyTo = null,
  onCancelReply,
  onSent,
}: CommentComposerProps) {
  const insets = useSafeAreaInsets();
  const { data: me } = useMyProfile();
  const addComment = useAddComment(postId);
  // Uncontrolled: the native field owns the text so fast typing never drops keys.
  const [body, setBody] = useState('');
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_COMMENT && !pending;

  // The comment shows in the thread right away (optimistic). The text stays
  // in the field until the server confirms, so a failure loses nothing; on
  // success the field clears, the keyboard closes and the composer collapses.
  const send = async () => {
    if (!canSend || sending.current) return;
    sending.current = true;
    setPending(true);
    const reply = replyTo;
    try {
      await addComment.mutateAsync({ body, reply });
      inputRef.current?.clear();
      setBody('');
      inputRef.current?.blur();
      Keyboard.dismiss();
      onSent?.(reply);
    } catch {
      // useAddComment rolls back and shows the error; keep the text to retry.
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {replyTo ? (
        <View style={styles.replying}>
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Replying to{' '}
            <AppText variant="caption" style={styles.replyName}>
              @{replyTo.user.username}
            </AppText>
          </AppText>
          <Pressable
            onPress={onCancelReply}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
          >
            <X size={iconSizes.sm} color={colors.textSecondary} strokeWidth={strokes.bold} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composer}>
        <Avatar uri={me?.avatarUrl} name={me?.displayName ?? ''} size="sm" />
        <TextInput
          ref={inputRef}
          onChangeText={setBody}
          placeholder={replyTo ? `Reply to @${replyTo.user.username}…` : 'Add a comment…'}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={MAX_COMMENT}
          autoFocus={autoFocus}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          accessibilityLabel={replyTo ? `Write a reply to @${replyTo.user.username}` : 'Write a comment'}
          style={styles.input}
          testID="comment-input"
        />
        <Pressable
          onPress={() => void send()}
          disabled={!canSend}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={pending ? 'Posting comment' : 'Post comment'}
          accessibilityState={{ disabled: !canSend, busy: pending }}
          testID="comment-send"
          style={styles.send}
        >
          {pending ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : (
            <AppText variant="calloutStrong" color={canSend ? 'accentStrong' : 'textTertiary'}>
              Post
            </AppText>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  replying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
    backgroundColor: colors.tint,
  },
  replyName: { fontFamily: fonts.textSemiBold, color: colors.text },
  flex: { flex: 1 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm,
  },
  // Same width either way, so the field doesn't jump while sending.
  send: { minWidth: 36, alignItems: 'flex-end' },
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
