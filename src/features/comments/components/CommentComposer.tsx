import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ClipboardPaste, ImagePlus, Sticker, X } from 'lucide-react-native';
import { useCallback, useRef, useState, type ComponentRef, type RefObject } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputSelectionChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, AppText, Avatar, type SheetAction } from '@/components/ui';
import { useMyProfile } from '@/features/profile/hooks';
import { haptics } from '@/lib/haptics';
import { openImageViewer } from '@/stores/imageViewer';
import { toast } from '@/stores/toast';
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

import { anonymousName, useAnonymousTakesStatus } from '../anonymous';
import type { MentionSuggestion, ReplyTarget } from '../api';
import { useAddComment, useMentionSuggestions } from '../hooks';
import { draftFromInsertedFile, fitWithin, imageFromClipboard, type DraftMedia } from '../media';
import {
  activeMentionQuery,
  distinctMentionCount,
  insertMention,
  MAX_MENTIONS,
  mentionIdsFor,
} from '../mentions';
import { AnonymousAvatar } from './AnonymousAvatar';
import { IdentityToggle } from './IdentityToggle';
import { MentionSuggestions } from './MentionSuggestions';
import { KEYBOARD_STICKERS_SUPPORTED, StickerAwareInput } from './StickerAwareInput';

const MAX_COMMENT = 1000;
const PREVIEW_BOX = 64;

export interface CommentComposerProps {
  postId: string;
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  autoFocus?: boolean;
  /** Set when replying: shown above the field and attached to the comment. */
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  /** Called after sending (e.g. to scroll to the new comment). */
  onSent?: (reply: ReplyTarget | null) => void;
}

/**
 * The "Add a comment…" bar pinned under a post's comments; also writes
 * replies. Text, @mentions, and one photo or sticker — or, where the
 * creator allows Anonymous Takes, text posted as this post's Chef #NN.
 */
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
  const [body, setBody] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // Only set right after inserting a mention (moves the cursor past it);
  // otherwise the field owns its cursor so typing never jumps.
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | undefined>();
  // Usernames picked from suggestions → ids (only those still in the text are sent).
  const picked = useRef(new Map<string, string>());
  const [media, setMedia] = useState<DraftMedia | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [focused, setFocused] = useState(false);

  // Anonymous Takes. Starts as you on every post (this composer lives with
  // the post screen), and stays as picked while you're in this thread.
  const anon = useAnonymousTakesStatus(postId);
  const [asAnon, setAsAnon] = useState(false);
  const anonymous = asAnon && anon.open;
  // Picked anonymous, but the creator has since turned it off: never fall
  // back to posting under your name without you choosing that.
  const anonClosed = asAnon && !anon.open;
  const myAnonNumber = anon.name ? Number(anon.name.replace(/\D/g, '')) || null : null;
  const setIdentity = (next: boolean) => {
    if (next && media) {
      setMedia(null);
      toast.show('Anonymous takes are text only, so the picture was removed.');
    }
    setAsAnon(next);
  };

  const trimmed = body.trim();
  const canSend = (trimmed.length > 0 || !!media) && trimmed.length <= MAX_COMMENT && !pending && !anonClosed;

  const mention = selection.start === selection.end ? activeMentionQuery(body, selection.start) : null;
  const suggestions = useMentionSuggestions(mention ? mention.query : null, postId);
  // No @mentions when anonymous: a mention would tell that person who wrote it.
  const showSuggestions = !!mention && !pending && !anonymous;

  const pickMention = useCallback(
    (user: MentionSuggestion) => {
      if (!mention) return;
      if (distinctMentionCount(body) >= MAX_MENTIONS && !picked.current.has(user.username)) {
        toast.error(`You can mention up to ${MAX_MENTIONS} people in a comment.`);
        return;
      }
      haptics.selection();
      picked.current.set(user.username, user.id);
      const next = insertMention(body, mention.start, selection.start, user.username);
      setBody(next.text);
      setSelection({ start: next.cursor, end: next.cursor });
      setForcedSelection({ start: next.cursor, end: next.cursor });
    },
    [body, mention, selection.start],
  );

  const attach = useCallback((draft: DraftMedia) => {
    haptics.selection();
    setMedia(draft);
  }, []);

  const choosePhoto = async () => {
    try {
      // The system photo picker (PHPicker): no library permission prompt.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: false,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      // Small PNG/WebP images (saved stickers, cut-outs) keep their transparency.
      const transparentish =
        /png|webp/i.test(asset.mimeType ?? asset.uri) && Math.max(asset.width, asset.height) <= 1200;
      attach({
        kind: transparentish ? 'sticker' : 'photo',
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
    } catch {
      toast.error('Couldn’t open your photos. Check Cheffy’s Photos permission in Settings.');
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const draft = await imageFromClipboard();
      if (draft) attach(draft);
      else toast.show('Copy a sticker or image first, then tap Paste.');
    } catch {
      toast.error('Couldn’t paste that image.');
    }
  };

  const onInsertedImages = useCallback(
    (uris: string[]) => {
      const uri = uris[0];
      if (!uri) return;
      if (uris.length > 1) toast.show('One picture per comment: the first one was added.');
      draftFromInsertedFile(uri)
        .then(attach)
        .catch(() => toast.error('Couldn’t add that sticker.'));
    },
    [attach],
  );

  const send = async () => {
    if (!canSend || sending.current) return;
    sending.current = true;
    setPending(true);
    const reply = replyTo;
    try {
      await addComment.mutateAsync(
        anonymous
          ? { body, reply, anonymous: true, anonNumber: myAnonNumber }
          : { body, reply, mentionIds: mentionIdsFor(body, picked.current, me?.id), media },
      );
      setBody('');
      setSelection({ start: 0, end: 0 });
      setForcedSelection(undefined);
      setMedia(null);
      picked.current.clear();
      inputRef.current?.blur();
      Keyboard.dismiss();
      onSent?.(reply);
    } catch {
      // useAddComment rolls back and explains; the text and picture stay to retry.
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  const menuActions: SheetAction[] = [
    { key: 'photo', label: 'Choose Photo', icon: ImagePlus, onPress: () => void choosePhoto() },
    {
      key: 'paste',
      label: 'Paste Sticker or Image',
      icon: ClipboardPaste,
      onPress: () => void pasteFromClipboard(),
    },
    ...(media
      ? [{ key: 'remove', label: 'Remove Picture', destructive: true, onPress: () => setMedia(null) }]
      : []),
  ];

  const preview = media ? fitWithin(media.width, media.height, PREVIEW_BOX, PREVIEW_BOX) : null;
  const replyName = replyTo
    ? replyTo.user
      ? `@${replyTo.user.username}`
      : `@${anonymousName(replyTo.anonNumber ?? 0)}`
    : null;
  const showIdentity = anon.open && (focused || body.length > 0 || asAnon || !!replyTo);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {showSuggestions ? (
        <MentionSuggestions
          results={suggestions.data ?? []}
          loading={suggestions.isFetching}
          onPick={pickMention}
        />
      ) : null}
      {replyTo ? (
        <View style={styles.replying}>
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Replying to{' '}
            <AppText variant="caption" style={styles.replyName}>
              {replyName}
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
      {media && preview ? (
        <View style={styles.attachment}>
          <Pressable
            onPress={() =>
              openImageViewer([
                {
                  key: 'composer-draft',
                  uri: media.uri,
                  thumbUri: media.uri,
                  width: media.width,
                  height: media.height,
                  label: media.kind === 'sticker' ? 'Your sticker' : 'Your photo',
                },
              ])
            }
            onLongPress={() => setMenuOpen(true)}
            accessibilityRole="imagebutton"
            accessibilityLabel={media.kind === 'sticker' ? 'Sticker to post' : 'Photo to post'}
            accessibilityHint="Opens it full screen"
            testID="comment-attachment-preview"
          >
            <Image
              source={{ uri: media.uri }}
              style={[preview, media.kind === 'photo' && styles.previewPhoto]}
              contentFit={media.kind === 'sticker' ? 'contain' : 'cover'}
            />
          </Pressable>
          <Pressable
            onPress={() => setMedia(null)}
            hitSlop={10}
            style={styles.removeAttachment}
            accessibilityRole="button"
            accessibilityLabel="Remove picture"
            testID="comment-attachment-remove"
          >
            <X size={12} color={colors.background} strokeWidth={strokes.bold} />
          </Pressable>
        </View>
      ) : null}
      {anonClosed ? (
        <View style={styles.replying}>
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Anonymous takes are off for this post now.
          </AppText>
          <Pressable
            onPress={() => setAsAnon(false)}
            hitSlop={10}
            accessibilityRole="button"
            testID="comment-as-me-instead"
          >
            <AppText variant="caption" style={styles.replyName}>
              Comment as @{me?.username ?? 'you'}
            </AppText>
          </Pressable>
        </View>
      ) : null}
      {showIdentity && me ? (
        <IdentityToggle
          username={me.username}
          displayName={me.displayName}
          avatarUrl={me.avatarUrl}
          anonymous={anonymous}
          anonymousName={anon.name}
          onChange={setIdentity}
        />
      ) : null}
      <View style={styles.composer}>
        {anonymous ? (
          <AnonymousAvatar size="sm" />
        ) : (
          <Avatar uri={me?.avatarUrl} name={me?.displayName ?? ''} size="sm" />
        )}
        <StickerAwareInput
          onImages={onInsertedImages}
          onUnsupported={() => toast.show('That can’t be added to a comment.')}
        >
          <TextInput
            ref={inputRef}
            value={body}
            onChangeText={setBody}
            selection={forcedSelection}
            onSelectionChange={(e: TextInputSelectionChangeEvent) => {
              setSelection(e.nativeEvent.selection);
              if (forcedSelection) setForcedSelection(undefined);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              replyTo
                ? `${anonymous ? 'Reply anonymously to' : 'Reply to'} ${replyName}…`
                : anonymous
                  ? 'Add an anonymous take…'
                  : 'Add a comment…'
            }
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_COMMENT}
            autoFocus={autoFocus}
            autoCorrect
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            accessibilityLabel={
              (replyTo ? `Write a reply to ${replyName}` : 'Write a comment') +
              (anonymous ? ', anonymously' : '')
            }
            style={styles.input}
            testID="comment-input"
          />
        </StickerAwareInput>
        {anonymous ? null : (
          <Pressable
            onPress={() => {
              haptics.selection();
              setMenuOpen(true);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={media ? 'Change picture' : 'Add a photo or sticker'}
            accessibilityHint={
              KEYBOARD_STICKERS_SUPPORTED ? 'Stickers can also be added from the emoji keyboard' : undefined
            }
            disabled={pending}
            testID="comment-attach"
            style={styles.attach}
          >
            {media?.kind === 'sticker' ? (
              <Sticker size={iconSizes.md} color={colors.accent} strokeWidth={strokes.regular} />
            ) : (
              <ImagePlus
                size={iconSizes.md}
                color={media ? colors.accent : colors.textSecondary}
                strokeWidth={strokes.regular}
              />
            )}
          </Pressable>
        )}
        <Pressable
          onPress={() => void send()}
          disabled={!canSend}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={pending ? 'Posting comment' : anonymous ? 'Post anonymously' : 'Post comment'}
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

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={media ? 'Replace picture' : 'Add a picture'}
        actions={menuActions}
      />
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
  attachment: {
    alignSelf: 'flex-start',
    marginLeft: SCREEN_GUTTER + 32 + spacing.md,
    marginTop: spacing.sm,
  },
  previewPhoto: { borderRadius: radii.md },
  removeAttachment: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm,
  },
  attach: { minWidth: 28, alignItems: 'center' },
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
