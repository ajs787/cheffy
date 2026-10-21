import { AppButton } from '@/components/ui';
import { useFollowAction } from '@/features/social/hooks';
import type { FollowState } from '@/types/models';

const LABELS: Record<FollowState, string> = { none: 'Follow', requested: 'Requested', following: 'Following' };

/**
 * Follow / Requested / Following. Private accounts get a request; tapping
 * "Requested" cancels it, tapping "Following" unfollows.
 */
export function FollowButton({
  userId,
  state,
  isPrivate,
  size = 'sm',
}: {
  userId: string;
  state: FollowState;
  isPrivate: boolean;
  size?: 'sm' | 'md';
}) {
  const follow = useFollowAction();
  const action = state === 'none' ? 'follow' : state === 'following' ? 'unfollow' : 'cancel';
  return (
    <AppButton
      label={LABELS[state]}
      variant={state === 'none' ? 'primary' : 'secondary'}
      size={size}
      onPress={() => follow.mutate({ userId, action, isPrivate })}
      accessibilityHint={
        state === 'following'
          ? 'Unfollow'
          : state === 'requested'
            ? 'Cancel your follow request'
            : isPrivate
              ? 'Sends a follow request'
              : undefined
      }
      testID={`follow-${userId}`}
    />
  );
}
