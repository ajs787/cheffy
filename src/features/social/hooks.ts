import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { useRequiredUserId } from '@/features/auth/store';
import { useMyProfile } from '@/features/profile/hooks';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import {
  removeAuthorFromCaches,
  restorePostCaches,
  snapshotPostCaches,
  updatePostInCaches,
} from '@/lib/query/cache';
import { invalidateAfterGraphChange } from '@/lib/query/invalidate';
import { queryKeys } from '@/lib/query/keys';
import { restoreUserCaches, setFollowingInUserCaches } from '@/lib/query/userCache';
import { toast } from '@/stores/toast';
import type { Comment, Post, ProfileWithViewer, ReportReason, ReportTarget } from '@/types/models';

import {
  addComment,
  blockUser,
  COMMENTS_PAGE,
  CONNECTIONS_PAGE,
  deleteComment,
  fetchBlockedUsers,
  fetchComments,
  fetchConnections,
  fetchSuggestedCooks,
  followUser,
  likePost,
  reportContent,
  savePostForLater,
  searchUsers,
  unblockUser,
  unfollowUser,
  unlikePost,
  unsavePost,
} from './api';

// ---------------------------------------------------------------------------
// Likes & saves — optimistic across every cached copy of the post
// ---------------------------------------------------------------------------
export function useToggleLike() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  return useMutation({
    mutationFn: ({ post, like }: { post: Pick<Post, 'id'>; like: boolean }) =>
      like ? likePost(me, post.id) : unlikePost(me, post.id),
    onMutate: async ({ post, like }) => {
      await qc.cancelQueries({ queryKey: queryKeys.posts });
      const snapshot = snapshotPostCaches(qc);
      updatePostInCaches(qc, post.id, (p) =>
        p.viewerHasLiked === like
          ? p
          : { ...p, viewerHasLiked: like, likeCount: Math.max(0, p.likeCount + (like ? 1 : -1)) },
      );
      if (like) haptics.light();
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      if (context) restorePostCaches(qc, context.snapshot);
      toast.error(toUserMessage(error, 'Couldn’t update your like.'));
    },
  });
}

export function useToggleSave() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  return useMutation({
    mutationFn: ({ post, save }: { post: Pick<Post, 'id'>; save: boolean }) =>
      save ? savePostForLater(me, post.id) : unsavePost(me, post.id),
    onMutate: async ({ post, save }) => {
      await qc.cancelQueries({ queryKey: queryKeys.posts });
      const snapshot = snapshotPostCaches(qc);
      updatePostInCaches(qc, post.id, (p) => ({ ...p, viewerHasSaved: save }));
      haptics.light();
      return { snapshot };
    },
    onSuccess: (_data, { save }) => {
      toast.success(save ? 'Saved to Want to Make' : 'Removed from saved');
    },
    onError: (error, _vars, context) => {
      if (context) restorePostCaches(qc, context.snapshot);
      toast.error(toUserMessage(error, 'Couldn’t update saved posts.'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.saved }),
  });
}

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------
export function useToggleFollow() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  return useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      follow ? followUser(me, userId) : unfollowUser(me, userId),
    onMutate: async ({ userId, follow }) => {
      const key = [...queryKeys.profile(userId), 'viewer'];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ProfileWithViewer | null>(key);
      if (previous) qc.setQueryData(key, { ...previous, viewerIsFollowing: follow });
      await Promise.all([
        qc.cancelQueries({ queryKey: ['users'] }),
        qc.cancelQueries({ queryKey: ['connections'] }),
      ]);
      const userLists = setFollowingInUserCaches(qc, userId, follow);
      haptics.light();
      return { previous, key, userLists };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
      if (context) restoreUserCaches(qc, context.userLists);
      toast.error(toUserMessage(error, 'Couldn’t update follow.'));
    },
    onSettled: (_data, _error, { userId }) => {
      void invalidateAfterGraphChange(qc, userId);
      void qc.invalidateQueries({ queryKey: queryKeys.profileStats(me) });
    },
  });
}

export function useConnections(userId: string | undefined, type: 'followers' | 'following') {
  return useInfiniteQuery({
    queryKey: queryKeys.connections(userId ?? '', type),
    queryFn: ({ pageParam }) => fetchConnections(userId!, type, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === CONNECTIONS_PAGE ? pages.length * CONNECTIONS_PAGE : undefined),
    enabled: !!userId,
  });
}

export function useUserSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.userSearch(q.toLowerCase()),
    queryFn: () => searchUsers(q),
    enabled: q.length >= 1,
    staleTime: 60_000,
  });
}

export function useSuggestedCooks() {
  return useQuery({ queryKey: queryKeys.suggestedCooks, queryFn: fetchSuggestedCooks, staleTime: 5 * 60_000 });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
export function useComments(postId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.comments(postId ?? ''),
    queryFn: ({ pageParam }) => fetchComments(postId!, pageParam),
    initialPageParam: null as { createdAt: string; id: string } | null,
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === COMMENTS_PAGE && tail ? { createdAt: tail.createdAt, id: tail.id } : undefined;
    },
    enabled: !!postId,
  });
}

type CommentPages = InfiniteData<Comment[], { createdAt: string; id: string } | null>;

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  const { data: profile } = useMyProfile();
  const key = queryKeys.comments(postId);

  return useMutation({
    mutationFn: (body: string) => addComment(me, postId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CommentPages>(key);
      const optimistic: Comment = {
        id: `pending-${Date.now()}`,
        postId,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        author: {
          id: me,
          username: profile?.username ?? '',
          displayName: profile?.displayName ?? '',
          avatarUrl: profile?.avatarUrl ?? null,
        },
      };
      qc.setQueryData<CommentPages>(key, (data) =>
        data
          ? { ...data, pages: data.pages.map((page, i) => (i === data.pages.length - 1 ? [...page, optimistic] : page)) }
          : { pages: [[optimistic]], pageParams: [null] },
      );
      updatePostInCaches(qc, postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      return { previous, optimisticId: optimistic.id };
    },
    onSuccess: (comment, _body, context) => {
      qc.setQueryData<CommentPages>(key, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => page.map((c) => (c.id === context?.optimisticId ? comment : c))),
            }
          : data,
      );
    },
    onError: (error, _body, context) => {
      qc.setQueryData(key, context?.previous);
      updatePostInCaches(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - 1) }));
      toast.error(toUserMessage(error, 'Couldn’t post your comment.'));
    },
  });
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  const key = queryKeys.comments(postId);
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CommentPages>(key);
      qc.setQueryData<CommentPages>(key, (data) =>
        data ? { ...data, pages: data.pages.map((page) => page.filter((c) => c.id !== commentId)) } : data,
      );
      updatePostInCaches(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - 1) }));
      return { previous };
    },
    onError: (error, _id, context) => {
      qc.setQueryData(key, context?.previous);
      updatePostInCaches(qc, postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      toast.error(toUserMessage(error, 'Couldn’t delete the comment.'));
    },
  });
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------
export function useBlockedUsers() {
  return useQuery({ queryKey: queryKeys.blocked, queryFn: fetchBlockedUsers });
}

export function useBlockUser() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  return useMutation({
    mutationFn: (userId: string) => blockUser(me, userId),
    onSuccess: (_data, userId) => {
      removeAuthorFromCaches(qc, userId);
      haptics.success();
      toast.show('Blocked. You won’t see each other’s posts.');
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t block this account.')),
    onSettled: (_data, _error, userId) => {
      void invalidateAfterGraphChange(qc, userId);
      void qc.invalidateQueries({ queryKey: queryKeys.blocked });
      void qc.invalidateQueries({ queryKey: queryKeys.profileStats(me) });
    },
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  return useMutation({
    mutationFn: (userId: string) => unblockUser(me, userId),
    onSuccess: () => toast.show('Unblocked'),
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t unblock this account.')),
    onSettled: (_data, _error, userId) => {
      void invalidateAfterGraphChange(qc, userId);
      void qc.invalidateQueries({ queryKey: queryKeys.blocked });
    },
  });
}

export function useReport() {
  const me = useRequiredUserId();
  return useMutation({
    mutationFn: ({ target, reason, details }: { target: ReportTarget; reason: ReportReason; details: string }) =>
      reportContent(me, target, reason, details),
    onSuccess: () => {
      haptics.success();
      toast.success('Thanks — we’ll review this report.');
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t send the report.')),
  });
}
