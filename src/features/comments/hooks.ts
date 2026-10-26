import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useRequiredUserId } from '@/features/auth/store';
import { PREVIEW_COMMENTS } from '@/features/posts/mappers';
import { useMyProfile } from '@/features/profile/hooks';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { updatePostInCaches } from '@/lib/query/cache';
import { queryKeys } from '@/lib/query/keys';
import { toast } from '@/stores/toast';
import type { Comment } from '@/types/models';

import {
  addComment,
  COMMENTS_PAGE,
  deleteComment,
  fetchComments,
  fetchReplies,
  likeComment,
  REPLIES_PAGE,
  unlikeComment,
  type CommentCursor,
  type ReplyTarget,
} from './api';
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

/** Posts a comment, or a reply when `reply` is set. Shows up immediately. */
export function useAddComment(postId: string) {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  const { data: profile } = useMyProfile();

  return useMutation({
    mutationFn: ({ body, reply }: { body: string; reply?: ReplyTarget | null }) =>
      addComment(me, postId, body, reply),
    onMutate: async ({ body, reply }) => {
      const optimistic: Comment = {
        id: `pending-${Date.now()}`,
        postId,
        parentId: reply?.parentId ?? null,
        replyTo: reply?.user ?? null,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        author: {
          id: me,
          username: profile?.username ?? '',
          displayName: profile?.displayName ?? '',
          avatarUrl: profile?.avatarUrl ?? null,
        },
        likeCount: 0,
        replyCount: 0,
        viewerHasLiked: false,
      };
      const key = cacheKeyFor(optimistic);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CommentPages>(key);
      qc.setQueryData<CommentPages>(key, (data) => appendComment(data, optimistic));
      if (reply) updateCommentInCaches(qc, reply.parentId, (c) => ({ ...c, replyCount: c.replyCount + 1 }));
      updatePostInCaches(qc, postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      return { previous, key, optimisticId: optimistic.id };
    },
    onSuccess: (comment, _vars, context) => {
      qc.setQueryData<CommentPages>(context.key, (data) =>
        replaceComment(data, context.optimisticId, comment),
      );
      // Feed cards preview the top comments; fill an empty slot with this one.
      if (!comment.parentId) {
        updatePostInCaches(qc, postId, (p) =>
          !p.topComments || p.topComments.length >= PREVIEW_COMMENTS
            ? p
            : {
                ...p,
                topComments: [
                  ...p.topComments,
                  { id: comment.id, body: comment.body, likeCount: 0, author: comment.author },
                ],
              },
        );
      }
    },
    onError: (error, { reply }, context) => {
      if (context) qc.setQueryData(context.key, context.previous);
      if (reply)
        updateCommentInCaches(qc, reply.parentId, (c) => ({
          ...c,
          replyCount: Math.max(0, c.replyCount - 1),
        }));
      updatePostInCaches(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - 1) }));
      toast.error(toUserMessage(error, 'Couldn’t post your comment.'));
    },
  });
}

/** Deletes a comment (and, for a top-level one, its replies). */
export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (comment: Comment) => deleteComment(comment.id),
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
        topComments: p.topComments?.filter((c) => c.id !== comment.id),
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
  const flip = (id: string, like: boolean) =>
    updateCommentInCaches(qc, id, (c) => ({
      ...c,
      viewerHasLiked: like,
      likeCount: Math.max(0, c.likeCount + (like ? 1 : -1)),
    }));
  return useMutation({
    mutationFn: ({ comment, like }: { comment: Comment; like: boolean }) =>
      like ? likeComment(me, comment.id) : unlikeComment(me, comment.id),
    onMutate: ({ comment, like }) => {
      if (like) haptics.light();
      flip(comment.id, like);
    },
    onError: (error, { comment, like }) => {
      flip(comment.id, !like);
      toast.error(toUserMessage(error, 'Couldn’t update that like.'));
    },
  });
}
