import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, fonts, HAIRLINE, radii, SCREEN_GUTTER, spacing } from '@/theme';

import { AnonymousAvatar } from './AnonymousAvatar';

export interface IdentityToggleProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  anonymous: boolean;
  /** The viewer's Chef name on this post, if they already have one. */
  anonymousName: string | null;
  onChange: (anonymous: boolean) => void;
}

/**
 * "Comment as @you / Anonymous Chef", right above the field, so who the
 * comment will be posted as is always visible before sending.
 */
export function IdentityToggle({
  username,
  displayName,
  avatarUrl,
  anonymous,
  anonymousName,
  onChange,
}: IdentityToggleProps) {
  const pick = (next: boolean) => {
    if (next === anonymous) return;
    haptics.selection();
    onChange(next);
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Comment as">
        <AppText variant="caption" color="textSecondary">
          Comment as
        </AppText>
        <Option
          selected={!anonymous}
          onPress={() => pick(false)}
          label={`@${username}`}
          spoken={`@${username}`}
        >
          <Avatar uri={avatarUrl} name={displayName} size="xs" />
        </Option>
        <Option
          selected={anonymous}
          onPress={() => pick(true)}
          label="Anonymous Chef"
          spoken="Anonymous Chef. Your profile isn’t shown."
          testID="comment-as-anonymous"
        >
          <AnonymousAvatar size="xs" />
        </Option>
      </View>
      {anonymous ? (
        <AppText variant="caption" color="textSecondary" style={styles.note}>
          {anonymousName
            ? `You’ll appear as ${anonymousName} on this post. Text only.`
            : 'You’ll get a Chef number for this post. Text only.'}
        </AppText>
      ) : null}
    </View>
  );
}

function Option({
  selected,
  onPress,
  label,
  spoken,
  testID,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  spoken: string;
  testID?: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={spoken}
      testID={testID}
      style={[styles.option, selected && styles.selected]}
    >
      {children}
      <AppText
        variant="caption"
        numberOfLines={1}
        style={[styles.optionText, selected && styles.selectedText]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.sm, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    maxWidth: 180,
  },
  selected: { borderColor: colors.accent, backgroundColor: colors.tint },
  optionText: { fontFamily: fonts.textSemiBold, color: colors.textSecondary, flexShrink: 1 },
  selectedText: { color: colors.accent },
  note: { marginLeft: 2 },
});
