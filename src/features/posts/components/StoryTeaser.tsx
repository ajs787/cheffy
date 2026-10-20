import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, HAIRLINE, spacing } from '@/theme';
import { readingMinutes } from '@/utils/format';

/** Feed-card hint that an entry has a story: label + two-line excerpt. */
export function StoryTeaser({ story }: { story: string }) {
  return (
    <View
      style={styles.teaser}
      accessible
      accessibilityLabel={`Has a story, ${readingMinutes(story)} minute read`}
    >
      <AppText variant="overline" color="accent">
        The story · {readingMinutes(story)} min read
      </AppText>
      <AppText variant="callout" color="textSecondary" numberOfLines={2}>
        {story.trim()}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  teaser: {
    gap: spacing.xs,
    paddingLeft: spacing.md,
    borderLeftWidth: HAIRLINE * 2,
    borderLeftColor: colors.accent,
  },
});
