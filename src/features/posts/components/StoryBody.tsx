import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fonts, HAIRLINE, spacing } from '@/theme';
import { paragraphs, readingMinutes } from '@/utils/format';

/** The full story on the post screen, set for long-form reading. */
export function StoryBody({ story }: { story: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="overline" color="accent">
          The story
        </AppText>
        <AppText variant="overline" color="textSecondary">
          {readingMinutes(story)} min read
        </AppText>
      </View>
      {paragraphs(story).map((paragraph, i) => (
        <AppText key={i} style={styles.paragraph}>
          {paragraph}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.rule,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  paragraph: { fontFamily: fonts.text, fontSize: 18, lineHeight: 28, color: colors.text },
});
