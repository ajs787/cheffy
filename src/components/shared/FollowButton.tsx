import { AppButton } from '@/components/ui';
import { useToggleFollow } from '@/features/social/hooks';

export function FollowButton({
  userId,
  following,
  size = 'sm',
}: {
  userId: string;
  following: boolean;
  size?: 'sm' | 'md';
}) {
  const toggle = useToggleFollow();
  return (
    <AppButton
      label={following ? 'Following' : 'Follow'}
      variant={following ? 'secondary' : 'primary'}
      size={size}
      onPress={() => toggle.mutate({ userId, follow: !following })}
      accessibilityHint={following ? 'Unfollow' : undefined}
      testID={`follow-${userId}`}
    />
  );
}
