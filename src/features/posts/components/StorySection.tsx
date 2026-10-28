import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, HAIRLINE, spacing } from '@/theme';
import { paragraphs, readingMinutes } from '@/utils/format';

/** Stories longer than this (or with more than one paragraph) can collapse. */
const SHORT_STORY_CHARS = 240;
const COLLAPSED_LINES = 3;

export function isLongStory(story: string): boolean {
  const text = story.trim();
  return text.length > SHORT_STORY_CHARS || paragraphs(text).length > 1;
}

export interface StorySectionProps {
  story: string;
  /** Long stories start collapsed in the feed and open on the post screen. */
  initiallyExpanded?: boolean;
}

/**
 * "The Story" under a post's review: same body type as the review, set in
 * oxblood (the review stays espresso) with an oxblood label and thin rule.
 * Long stories expand in place ("Read story" / "Show less"); short ones
 * always show in full.
 */
export function StorySection({ story, initiallyExpanded = false }: StorySectionProps) {
  const long = isLongStory(story);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const open = !long || expanded;
  const parts = paragraphs(story);
  const minutes = readingMinutes(story);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="overline" color="accent">
          The story
        </AppText>
        {long ? (
          <>
            <AppText variant="overline" color="textTertiary">
              ·
            </AppText>
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              hitSlop={{ top: 14, bottom: 14, left: 8, right: 24 }}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Show less of the story' : `Read story, ${minutes} minute read`}
              accessibilityState={{ expanded }}
            >
              <AppText variant="overline" color="accent" style={styles.toggle}>
                {expanded ? 'Show less' : `Read story · ${minutes} min`}
              </AppText>
            </Pressable>
          </>
        ) : null}
      </View>
      {open ? (
        parts.map((paragraph, i) => (
          <AppText key={i} variant="body" color="accent">
            {paragraph}
          </AppText>
        ))
      ) : (
        <AppText
          variant="body"
          color="accent"
          numberOfLines={COLLAPSED_LINES}
          onPress={() => setExpanded(true)}
          accessibilityHint="Shows the whole story"
        >
          {parts.join(' ')}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderLeftWidth: HAIRLINE * 2,
    borderLeftColor: colors.accent,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  toggle: { textDecorationLine: 'underline' },
});
