import { X } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FollowButton } from '@/components/shared/FollowButton';
import { AppText, Avatar, PressableScale } from '@/components/ui';
import { colors, HAIRLINE, radii, spacing, strokes } from '@/theme';
import { followStateOf, type ProfileSummary, type UserListItem } from '@/types/models';

export const SUGGESTION_CARD_WIDTH = 156;

/**
 * A person to follow: avatar, name, a short line of context (the honest
 * reason, or when they joined), Follow, and optionally a "New" badge and a
 * dismiss X.
 */
export const SuggestionCard = memo(function SuggestionCard({
  person,
  detail,
  badge,
  onOpen,
  onDismiss,
}: {
  person: UserListItem;
  detail: string;
  badge?: string;
  onOpen: (p: ProfileSummary) => void;
  onDismiss?: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      {badge ? (
        <View style={styles.badge}>
          <AppText variant="overline" color="accent" style={styles.badgeText}>
            {badge}
          </AppText>
        </View>
      ) : null}
      {onDismiss ? (
        <Pressable
          onPress={() => onDismiss(person.id)}
          hitSlop={8}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel={`Don’t suggest ${person.displayName}`}
        >
          <X size={14} color={colors.textTertiary} strokeWidth={strokes.bold} />
        </Pressable>
      ) : null}
      <PressableScale
        onPress={() => onOpen(person)}
        activeScale={0.97}
        accessibilityRole="link"
        accessibilityLabel={`${person.displayName}, @${person.username}. ${badge ? `${badge}. ` : ''}${detail}`}
        style={styles.body}
      >
        <Avatar uri={person.avatarUrl} name={person.displayName} size="lg" />
        <AppText variant="calloutStrong" numberOfLines={1} align="center">
          {person.displayName}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1} align="center">
          @{person.username}
        </AppText>
        <AppText
          variant="caption"
          color="textTertiary"
          numberOfLines={2}
          align="center"
          style={styles.reason}
        >
          {detail}
        </AppText>
      </PressableScale>
      <FollowButton userId={person.id} state={followStateOf(person)} isPrivate={person.isPrivate} />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: SUGGESTION_CARD_WIDTH,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    paddingTop: spacing.lg,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  body: { alignItems: 'center', gap: 2, alignSelf: 'stretch' },
  reason: { minHeight: 32, marginTop: 2 },
  dismiss: { position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1 },
  // A small crème tag in the top-left corner, clear of the avatar.
  badge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    zIndex: 1,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radii.sm,
    backgroundColor: colors.tint,
  },
  badgeText: { fontSize: 10, lineHeight: 14 },
});
