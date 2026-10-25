import { router } from 'expo-router';
import { UserPlus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, Avatar, ConfirmationDialog, RatingRing } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { colors, HAIRLINE, iconSizes, radii, spacing, strokes } from '@/theme';
import { madeByNames, type CoCreator, type Post } from '@/types/models';

import { useInviteCollaborators, useRemoveCollaborator, useRespondToCollaboration } from '../hooks';
import { MyEvaluationSheet } from './MyEvaluationSheet';
import { PeoplePicker } from './PeoplePicker';

const MAX_COLLABORATORS = 5;

/**
 * Shared-creation section of a post: the invitation (for the invitee), the
 * co-creators with their own ratings and reviews, and role-appropriate
 * actions — the creator invites/removes, a co-creator rates or leaves.
 */
export function CollaborationPanel({ post }: { post: Post }) {
  const me = useUserId();
  const respond = useRespondToCollaboration();
  const invite = useInviteCollaborators();
  const remove = useRemoveCollaborator();
  const [picking, setPicking] = useState(false);
  const [rating, setRating] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<CoCreator | 'leave' | null>(null);

  if (post.status !== 'published') return null;
  const isCreator = post.author.id === me;
  const mine = post.coCreators.find((c) => c.profile.id === me);
  const invitedMe = post.pendingInvitees.some((p) => p.id === me);
  const active = post.coCreators.length + post.pendingInvitees.length;
  if (!isCreator && !mine && !invitedMe && post.coCreators.length === 0) return null;

  return (
    <View style={styles.container}>
      {invitedMe ? (
        <View style={styles.invite}>
          <AppText variant="bodyStrong">
            {post.author.displayName} invited you to co-post this creation
          </AppText>
          <AppText variant="callout" color="textSecondary">
            Accept to share it on your profile. You’ll add your own rating; theirs stays theirs.
          </AppText>
          <View style={styles.inviteActions}>
            <AppButton
              label="Accept"
              size="sm"
              style={styles.flex}
              loading={respond.isPending}
              onPress={() => respond.mutate({ postId: post.id, accept: true })}
            />
            <AppButton
              label="Decline"
              size="sm"
              variant="secondary"
              style={styles.flex}
              onPress={() => respond.mutate({ postId: post.id, accept: false })}
            />
          </View>
        </View>
      ) : null}

      {post.coCreators.length > 0 || isCreator ? (
        <View style={styles.heading}>
          <Users size={iconSizes.sm} color={colors.textSecondary} strokeWidth={strokes.bold} />
          <AppText variant="overline" color="textSecondary">
            {post.coCreators.length > 0
              ? `Made by ${madeByNames([post.author.displayName, ...post.coCreators.map((c) => c.profile.displayName)])}`
              : 'Made together?'}
          </AppText>
        </View>
      ) : null}

      {post.coCreators.map((c) => (
        <View key={c.profile.id} style={styles.coCreator}>
          <Pressable
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: c.profile.id } })}
            style={styles.who}
            accessibilityRole="link"
            accessibilityLabel={`${c.profile.displayName}${c.rating === null ? ', not rated yet' : `, rated ${c.rating}`}`}
          >
            <Avatar uri={c.profile.avatarUrl} name={c.profile.displayName} size="sm" />
            <View style={styles.flex}>
              <AppText variant="calloutStrong">{c.profile.id === me ? 'You' : c.profile.displayName}</AppText>
              {c.review?.trim() ? (
                <AppText variant="callout" color="textSecondary" numberOfLines={3}>
                  {c.review.trim()}
                </AppText>
              ) : c.rating === null ? (
                <AppText variant="caption" color="textTertiary">
                  Hasn’t rated it yet
                </AppText>
              ) : null}
            </View>
            {c.rating !== null ? <RatingRing value={c.rating} size="sm" /> : null}
          </Pressable>
          {isCreator ? (
            <Pressable onPress={() => setConfirmRemove(c)} hitSlop={8} accessibilityRole="button">
              <AppText variant="caption" color="textSecondary">
                Remove
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ))}

      {isCreator && post.pendingInvitees.length > 0 ? (
        <AppText variant="caption" color="textTertiary">
          Waiting on {madeByNames(post.pendingInvitees.map((p) => `@${p.username}`))}
        </AppText>
      ) : null}

      {mine ? (
        <View style={styles.row}>
          <AppButton
            label={mine.rating === null ? 'Add your rating' : 'Edit your rating'}
            size="sm"
            style={styles.flex}
            onPress={() => setRating(true)}
          />
          <AppButton label="Leave" size="sm" variant="secondary" onPress={() => setConfirmRemove('leave')} />
        </View>
      ) : null}

      {isCreator && active < MAX_COLLABORATORS ? (
        <AppButton
          label={post.coCreators.length > 0 ? 'Invite another co-creator' : 'Invite co-creators'}
          icon={UserPlus}
          size="sm"
          variant="secondary"
          onPress={() => setPicking(true)}
        />
      ) : null}

      <PeoplePicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Made with"
        confirmLabel="Send invitation"
        exclude={[
          post.author.id,
          ...post.coCreators.map((c) => c.profile.id),
          ...post.pendingInvitees.map((p) => p.id),
        ]}
        max={MAX_COLLABORATORS - active}
        onConfirm={(people) => invite.mutate({ postId: post.id, userIds: people.map((p) => p.id) })}
      />
      {mine ? (
        <MyEvaluationSheet
          visible={rating}
          onClose={() => setRating(false)}
          postId={post.id}
          title={post.title}
          initialRating={mine.rating}
          initialReview={mine.review}
        />
      ) : null}
      <ConfirmationDialog
        visible={confirmRemove !== null}
        title={
          confirmRemove === 'leave'
            ? 'Leave this creation?'
            : `Remove ${confirmRemove?.profile.displayName ?? ''}?`
        }
        message={
          confirmRemove === 'leave'
            ? 'It will stay on the creator’s profile. Your rating and review will be removed.'
            : 'It stays your creation. Their rating and review will be removed.'
        }
        confirmLabel={confirmRemove === 'leave' ? 'Leave' : 'Remove'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove === 'leave' && me) remove.mutate({ postId: post.id, userId: me });
          else if (confirmRemove && confirmRemove !== 'leave')
            remove.mutate({ postId: post.id, userId: confirmRemove.profile.id });
          setConfirmRemove(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingTop: spacing.md },
  flex: { flex: 1 },
  invite: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.tint,
    borderWidth: HAIRLINE,
    borderColor: colors.rule,
  },
  inviteActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  coCreator: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
});
