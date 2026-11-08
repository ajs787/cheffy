import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { useRequiredUserId } from '@/features/auth/store';
import { useMyProfile } from '@/features/profile/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { updatePostInCaches } from '@/lib/query/cache';
import { queryKeys } from '@/lib/query/keys';
import { toast } from '@/stores/toast';
import type { Comment } from '@/types/models';

import { anonymousTakesKey } from './anonymous';
import {
  addAnonymousTake,
  addComment,
  COMMENTS_PAGE,
  deleteComment,
  fetchComments,
  fetchMentionSuggestions,
  fetchReplies,
  likeComment,
  REPLIES_PAGE,
  unlikeComment,
  type CommentCursor,
  type ReplyTarget,
} from './api';
import { MediaUploadError, newUploadId, uploadMedia, type DraftMedia } from './media';
import {
  appendComment,
  cacheKeyFor,
  removeComment,
  replaceComment,
  updateCommentInCaches,
  type CommentPages,
} from './cache';

const nextCursor = (page: Comment[], size: number): CommentCursor | undefined => {
  const tail = page[page.length - 1];
  return page.length === size && tail ? { createdAt: tail.createdAt, id: tail.id } : undefined;
};

/** A post's top-level comments. */
export function useComments(postId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.comments(postId ?? ''),
    queryFn: ({ pageParam }) => fetchComments(postId!, pageParam),
    initialPageParam: null as CommentCursor,
    getNextPageParam: (last) => nextCursor(last, COMMENTS_PAGE),
    enabled: !!postId,
  });
}

/** One thread's replies; fetched only once the thread is opened. */
export function useReplies(parentId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.replies(parentId),
    queryFn: ({ pageParam }) => fetchReplies(parentId, pageParam),
    initialPageParam: null as CommentCursor,
    getNextPageParam: (last) => nextCursor(last, REPLIES_PAGE),
    enabled,
  });
}

export interface SendComment {
  body: string;
  reply?: ReplyTarget | null;
  mentionIds?: string[];
  media?: DraftMedia | null;
  /** Post as this post's anonymous chef (text only). */
  anonymous?: boolean;
  /** The viewer's Chef number here, when they already have one (shown while posting). */
  anonNumber?: number | null;
}

/**
 * Upload ids per picked file, so retrying a failed send (or a lost
 * response) reuses the same upload instead of making another one.
 */
const uploadIds = new Map<string, string>();

async function ensureUpload(media: DraftMedia): Promise<string> {
  let id = uploadIds.get(media.uri);
  if (!id) {
    id = newUploadId();
    uploadIds.set(media.uri, id);
  }
  await uploadMedia(id, media);
  return id;
}

const isExpired = (error: unknown) => /attachment (expired|not found)/i.test((error as Error)?.message ?? '');

/**
 * Posts a comment, or a reply when `reply` is set. Shows up immediately.
 * A picture is uploaded first (only on send); the comment row is written
 * only after the upload succeeded, so a failed upload never leaves a broken
 * comment, and the composer keeps the draft to retry.
 */
export function useAddComment(postId: string) {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  const { data: profile } = useMyProfile();

  return useMutation({
    mutationFn: async ({ body, reply, mentionIds, media, anonymous }: SendComment) => {
      if (anonymous) return addAnonymousTake(postId, { body, reply });
      const send = async () =>
        addComment(me, postId, {
          body,
          reply,
          mentionIds,
          uploadId: media ? await ensureUpload(media) : null,
        });
      try {
        const comment = await send();
        if (media) uploadIds.delete(media.uri);
        return comment;
      } catch (error) {
        // The upload was swept (a very old retry): upload again once.
        if (media && isExpired(error)) {
          uploadIds.delete(media.uri);
          const comment = await send();
          uploadIds.delete(media.uri);
          return comment;
        }
        throw error;
      }
    },
    onMutate: async ({ body, reply, media, anonymous, anonNumber }) => {
      const optimistic: Comment = {
        id: `pending-${Date.now()}`,
        postId,
        parentId: reply?.parentId ?? null,
        replyTo: reply?.user ?? null,
        replyToAnonNumber: reply?.user ? null : (reply?.anonNumber ?? null),
        body: body.trim(),
        createdAt: new Date().toISOString(),
        author: anonymous
          ? null
          : {
              id: me,
              username: profile?.username ?? '',
              displayName: profile?.displayName ?? '',
              avatarUrl: profile?.avatarUrl ?? null,
            },
        anonNumber: anonymous ? (anonNumber ?? 0) : null,
        isMine: true,
        likeCount: 0,
        replyCount: 0,
        viewerHasLiked: false,
        viewerLikedAnonymously: false,
        media: media
          ? {
              kind: media.kind,
              path: null,
              thumbPath: null,
              thumbUrl: media.uri,
              localUri: media.uri,
              width: media.width,
              height: media.height,
              removed: false,
            }
          : null,
        mentions: [],
      };
      const key = cacheKeyFor(optimistic);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CommentPages>(key);
      qc.setQueryData<CommentPages>(key, (data) => appendComment(data, optimistic));
      if (reply) updateCommentInCaches(qc, reply.parentId, (c) => ({ ...c, replyCount: c.replyCount + 1 }));
      updatePostInCaches(qc, postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      return { previous, key, optimisticId: optimistic.id };
    },
    onSuccess: (comment, { anonymous }, context) => {
      qc.setQueryData<CommentPages>(context.key, (data) =>
        replaceComment(data, context.optimisticId, comment),
      );
      // The first anonymous take here hands out a Chef number: show it next time.
      if (anonymous) void qc.invalidateQueries({ queryKey: anonymousTakesKey(me, postId) });
    },
    onError: (error, { reply }, context) => {
      if (context) qc.setQueryData(context.key, context.previous);
      if (reply)
        updateCommentInCaches(qc, reply.parentId, (c) => ({
          ...c,
          replyCount: Math.max(0, c.replyCount - 1),
        }));
      updatePostInCaches(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - 1) }));
      toast.error(commentErrorMessage(error));
    },
  });
}

function commentErrorMessage(error: unknown): string {
  if (error instanceof MediaUploadError) {
    if (error.status === 429) return 'You’ve added a lot of pictures. Try again in a little while.';
    if (error.status === 413 || error.status === 422)
      return 'That picture can’t be used. Try a different one.';
  }
  const message = (error as Error)?.message ?? '';
  if (/too many photo comments/i.test(message))
    return 'You’ve posted a lot of pictures. Try again in a little while.';
  if (/up to 5 mentions/i.test(message)) return 'You can mention up to 5 people in a comment.';
  if (/anonymous takes aren’t open/i.test(message))
    return 'Anonymous takes are off for this post now. Your draft is still here.';
  if (/commenting a lot|too many anonymous takes|a lot of takes on one post/i.test(message))
    return 'You’re commenting a lot. Take a short break and try again.';
  if (/already posted that/i.test(message)) return 'You already posted that.';
  return toUserMessage(error, 'Couldn’t post your comment. Your draft is still here.');
}

/** @mention suggestions for what's typed after "@" (debounced, cached). */
export function useMentionSuggestions(query: string | null, postId?: string) {
  const debounced = useDebouncedValue(query, 150);
  const me = useRequiredUserId();
  return useQuery({
    queryKey: ['mention-suggestions', me, postId ?? '', debounced ?? ''],
    queryFn: () => fetchMentionSuggestions(debounced ?? '', postId),
    enabled: debounced !== null,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Deletes a comment (and, for a top-level one, its replies). */
export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (comment: Comment) => deleteComment(comment),
    onMutate: async (comment) => {
      const key = cacheKeyFor(comment);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CommentPages>(key);
      qc.setQueryData<CommentPages>(key, (data) => removeComment(data, comment.id));
      if (comment.parentId) {
        updateCommentInCaches(qc, comment.parentId, (c) => ({
          ...c,
          replyCount: Math.max(0, c.replyCount - 1),
        }));
      }
      // A top-level comment takes its replies with it.
      const removed = 1 + (comment.parentId ? 0 : comment.replyCount);
      updatePostInCaches(qc, postId, (p) => ({
        ...p,
        commentCount: Math.max(0, p.commentCount - removed),
      }));
      return { previous, key, removed };
    },
    onError: (error, comment, context) => {
      if (context) qc.setQueryData(context.key, context.previous);
      if (comment.parentId)
        updateCommentInCaches(qc, comment.parentId, (c) => ({ ...c, replyCount: c.replyCount + 1 }));
      updatePostInCaches(qc, postId, (p) => ({
        ...p,
        commentCount: p.commentCount + (context?.removed ?? 1),
      }));
      toast.error(toUserMessage(error, 'Couldn’t delete the comment.'));
    },
  });
}

/** Like or unlike a comment, optimistically wherever it's shown. */
export function useToggleCommentLike() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  const flip = (id: string, like: boolean, anonymous: boolean) =>
    updateCommentInCaches(qc, id, (c) => ({
      ...c,
      viewerHasLiked: like,
      viewerLikedAnonymously: like && anonymous,
      likeCount: Math.max(0, c.likeCount + (like ? 1 : -1)),
    }));
  return useMutation({
    mutationFn: ({
      comment,
      like,
      anonymous = false,
    }: {
      comment: Comment;
      like: boolean;
      anonymous?: boolean;
    }) => (like ? likeComment(me, comment.id, anonymous) : unlikeComment(me, comment.id)),
    onMutate: ({ comment, like, anonymous = false }) => {
      if (like) haptics.light();
      flip(comment.id, like, anonymous);
    },
    onError: (error, { comment, like }) => {
      flip(comment.id, !like, comment.viewerLikedAnonymously);
      toast.error(toUserMessage(error, 'Couldn’t update that like.'));
    },
    onSuccess: (_data, { like, anonymous }) => {
      if (like && anonymous) toast.success('Liked anonymously');
    },
  });
}
