import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRequiredUserId, useUserId } from '@/features/auth/store';
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
import { restoreUserCaches, setFollowStateInUserCaches } from '@/lib/query/userCache';
import { usePushPromptStore } from '@/stores/pushPrompt';
import { toast } from '@/stores/toast';
import type { FollowState, Post, ProfileWithViewer, ReportReason, ReportTarget } from '@/types/models';

import {
  acceptFollowRequest,
  blockUser,
  cancelFollowRequest,
  declineFollowRequest,
  CONNECTIONS_PAGE,
  fetchBlockedUsers,
  fetchConnections,
  fetchFollowRequests,
  dismissSuggestion,
  fetchSuggestedCooks,
  fetchSuggestedFriends,
  PEOPLE_PAGE,
  searchPeople,
  type SuggestedFriend,
  followUser,
  likePost,
  removeFollower,
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
export type FollowAction = 'follow' | 'unfollow' | 'cancel';

/** What a follow action leads to, before the server answers. */
export function optimisticFollowState(action: FollowAction, isPrivate: boolean): FollowState {
  if (action === 'follow') return isPrivate ? 'requested' : 'following';
  return 'none';
}

/**
 * Follow (or request to, for private accounts), unfollow, or cancel a
 * request. Optimistic everywhere the person appears; the server's answer
 * ('following' vs 'requested') wins.
 */
export function useFollowAction() {
  const qc = useQueryClient();
  const me = useRequiredUserId();

  const apply = (userId: string, state: FollowState) => {
    const key = [...queryKeys.profile(userId), 'viewer'];
    const previous = qc.getQueryData<ProfileWithViewer | null>(key);
    if (previous) {
      qc.setQueryData(key, {
        ...previous,
        viewerIsFollowing: state === 'following',
        viewerHasRequested: state === 'requested',
      });
    }
    return { key, previous, userLists: setFollowStateInUserCaches(qc, userId, state) };
  };

  return useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: FollowAction; isPrivate: boolean }) => {
      if (action === 'follow') return followUser(userId);
      if (action === 'unfollow') await unfollowUser(me, userId);
      else await cancelFollowRequest(me, userId);
      return 'none' as const;
    },
    onMutate: async ({ userId, action, isPrivate }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.profile(userId) }),
        qc.cancelQueries({ queryKey: ['users'] }),
        qc.cancelQueries({ queryKey: ['connections'] }),
      ]);
      haptics.light();
      return apply(userId, optimisticFollowState(action, isPrivate));
    },
    onSuccess: (state, { userId }) => {
      apply(userId, state);
      // First follow: offer notifications (only ever offered once).
      if (state !== 'none') usePushPromptStore.getState().offerOnce();
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

/** People waiting for the viewer to approve them (private accounts). */
export function useFollowRequests() {
  const me = useRequiredUserId();
  return useQuery({ queryKey: queryKeys.followRequests, queryFn: () => fetchFollowRequests(me) });
}

/** Accept or decline a request; the row disappears from the list right away. */
export function useRespondToFollowRequest() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  return useMutation({
    mutationFn: ({ userId, accept }: { userId: string; accept: boolean }) =>
      accept ? acceptFollowRequest(userId) : declineFollowRequest(me, userId),
    onMutate: async ({ userId }) => {
      await qc.cancelQueries({ queryKey: queryKeys.followRequests });
      const previous = qc.getQueryData<{ user: { id: string } }[]>(queryKeys.followRequests);
      qc.setQueryData(
        queryKeys.followRequests,
        previous?.filter((r) => r.user.id !== userId),
      );
      haptics.light();
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.followRequests, context.previous);
      toast.error(toUserMessage(error, 'Couldn’t update that request.'));
    },
    onSettled: (_data, _error, { userId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.followRequests });
      void qc.invalidateQueries({ queryKey: ['activity'] });
      void invalidateAfterGraphChange(qc, userId);
      void qc.invalidateQueries({ queryKey: queryKeys.profileStats(me) });
    },
  });
}

/** Removes someone from your followers (they lose access to private content). */
export function useRemoveFollower() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  return useMutation({
    mutationFn: (userId: string) => removeFollower(me, userId),
    onSuccess: () => {
      haptics.light();
      toast.success('Removed from your followers');
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t remove that follower.')),
    onSettled: (_data, _error, userId) => {
      void invalidateAfterGraphChange(qc, userId);
      void qc.invalidateQueries({ queryKey: queryKeys.connections(me, 'followers') });
      void qc.invalidateQueries({ queryKey: queryKeys.profileStats(me) });
    },
  });
}

export function useConnections(userId: string | undefined, type: 'followers' | 'following') {
  return useInfiniteQuery({
    queryKey: queryKeys.connections(userId ?? '', type),
    queryFn: ({ pageParam }) => fetchConnections(userId!, type, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length === CONNECTIONS_PAGE ? pages.length * CONNECTIONS_PAGE : undefined,
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

/** Paged people search for Find Friends (cached under ['users'] so follow buttons stay in sync). */
export function usePeopleSearch(query: string) {
  const q = query.trim().toLowerCase();
  return useInfiniteQuery({
    queryKey: ['users', 'people-search', q],
    queryFn: ({ pageParam }) => searchPeople(q, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PEOPLE_PAGE ? pages.length * PEOPLE_PAGE : undefined),
    enabled: q.length >= 1,
    staleTime: 60_000,
  });
}

const suggestedFriendsKey = ['users', 'suggested-friends'] as const;

export function useSuggestedFriends() {
  const me = useUserId();
  return useQuery({
    queryKey: suggestedFriendsKey,
    queryFn: () => fetchSuggestedFriends(20),
    enabled: !!me,
    staleTime: 5 * 60_000,
  });
}

/** Removes a suggestion at once; it never comes back unless the save fails. */
export function useDismissSuggestion() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  return useMutation({
    mutationFn: (userId: string) => dismissSuggestion(me, userId),
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: suggestedFriendsKey });
      const previous = qc.getQueryData<SuggestedFriend[]>(suggestedFriendsKey);
      qc.setQueryData<SuggestedFriend[]>(suggestedFriendsKey, (list) => list?.filter((u) => u.id !== userId));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) qc.setQueryData(suggestedFriendsKey, context.previous);
    },
  });
}

export function useSuggestedCooks() {
  return useQuery({
    queryKey: queryKeys.suggestedCooks,
    queryFn: fetchSuggestedCooks,
    staleTime: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
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
    mutationFn: ({
      target,
      reason,
      details,
    }: {
      target: ReportTarget;
      reason: ReportReason;
      details: string;
    }) => reportContent(me, target, reason, details),
    onSuccess: () => {
      haptics.success();
      toast.success('Thanks — we’ll review this report.');
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t send the report.')),
  });
}
