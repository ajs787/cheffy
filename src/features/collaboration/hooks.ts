import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/store';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { invalidateAfterPostChange } from '@/lib/query/invalidate';
import { queryKeys } from '@/lib/query/keys';
import { toast } from '@/stores/toast';

import { inviteCollaborators, removeCollaborator, respondToCollaboration, setMyEvaluation } from './api';

/** Refreshes the post and everything a co-creator change shows up in. */
function useRefreshAfter() {
  const qc = useQueryClient();
  const me = useUserId();
  return (postId: string) => {
    void qc.invalidateQueries({ queryKey: queryKeys.post(postId) });
    void qc.invalidateQueries({ queryKey: ['activity'] });
    if (me) void invalidateAfterPostChange(qc, me);
  };
}

export function useInviteCollaborators() {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: ({ postId, userIds }: { postId: string; userIds: string[] }) =>
      inviteCollaborators(postId, userIds),
    onSuccess: (_data, { postId, userIds }) => {
      haptics.success();
      toast.success(userIds.length === 1 ? 'Invitation sent' : `${userIds.length} invitations sent`);
      refresh(postId);
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t send the invitation.')),
  });
}

export function useRespondToCollaboration() {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: ({ postId, accept }: { postId: string; accept: boolean }) =>
      respondToCollaboration(postId, accept),
    onSuccess: (_data, { postId, accept }) => {
      haptics.success();
      toast.success(accept ? 'You’re a co-creator now — add your own rating' : 'Invitation declined');
      refresh(postId);
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t answer the invitation.')),
  });
}

export function useRemoveCollaborator() {
  const refresh = useRefreshAfter();
  const me = useUserId();
  return useMutation({
    mutationFn: ({ postId, userId }: { postId: string; userId: string }) =>
      removeCollaborator(postId, userId),
    onSuccess: (_data, { postId, userId }) => {
      toast.success(userId === me ? 'You left this creation' : 'Removed from this creation');
      refresh(postId);
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t update the collaboration.')),
  });
}

export function useSetMyEvaluation() {
  const refresh = useRefreshAfter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, rating, review }: { postId: string; rating: number; review: string }) =>
      setMyEvaluation(postId, rating, review),
    onSuccess: (_data, { postId }) => {
      haptics.success();
      toast.success('Your rating is saved');
      void qc.invalidateQueries({ queryKey: ['rankings'] });
      refresh(postId);
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t save your rating.')),
  });
}
