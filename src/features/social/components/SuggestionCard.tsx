import { X } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FollowButton } from '@/components/shared/FollowButton';
import { AppText, Avatar, PressableScale } from '@/components/ui';
import { colors, HAIRLINE, radii, spacing, strokes } from '@/theme';
import { followStateOf, type ProfileSummary } from '@/types/models';

import type { SuggestedFriend } from '../api';

export const SUGGESTION_CARD_WIDTH = 156;

/** A person to follow: avatar, name, the honest reason, Follow, and a dismiss X. */
export const SuggestionCard = memo(function SuggestionCard({
  person,
  onOpen,
  onDismiss,
}: {
  person: SuggestedFriend;
  onOpen: (p: ProfileSummary) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => onDismiss(person.id)}
        hitSlop={8}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel={`Don’t suggest ${person.displayName}`}
      >
        <X size={14} color={colors.textTertiary} strokeWidth={strokes.bold} />
      </Pressable>
      <PressableScale
        onPress={() => onOpen(person)}
        activeScale={0.97}
        accessibilityRole="link"
        accessibilityLabel={`${person.displayName}, @${person.username}. ${person.reason}`}
        style={styles.body}
      >
        <Avatar uri={person.avatarUrl} name={person.displayName} size="lg" />
        <AppText variant="calloutStrong" numberOfLines={1} align="center">
          {person.displayName}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1} align="center">
          @{person.username}
        </AppText>
        <AppText variant="caption" color="textTertiary" numberOfLines={2} align="center" style={styles.reason}>
          {person.reason}
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
});
