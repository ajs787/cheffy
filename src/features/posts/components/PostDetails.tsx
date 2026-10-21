import * as WebBrowser from 'expo-web-browser';
import { ExternalLink } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Divider, PressableScale } from '@/components/ui';
import { colors, iconSizes, radii, spacing, strokes } from '@/theme';
import type { Post } from '@/types/models';
import { formatCalendarDate } from '@/utils/dates';
import { formatCookTime } from '@/utils/format';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}: ${typeof children === 'string' ? children : ''}`}
    >
      <AppText variant="callout" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="calloutStrong" style={styles.rowValue}>
        {children}
      </AppText>
    </View>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.block}>
      <AppText variant="overline" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="body">{text}</AppText>
    </View>
  );
}

/** The optional facts about one attempt: only what was filled in. */
export function PostDetails({ post }: { post: Post }) {
  const facts: [string, string][] = [];
  facts.push(['Made', formatCalendarDate(post.madeOn)]);
  if (post.wouldMakeAgain !== null) facts.push(['Would make again', post.wouldMakeAgain ? 'Yes' : 'No']);
  if (post.temperature) facts.push(['Served', post.temperature === 'iced' ? 'Iced' : 'Hot']);
  if (post.milk) facts.push(['Milk', post.milk]);
  if (post.sweetener) facts.push(['Sweetener', post.sweetener]);
  if (post.cookTimeMinutes) facts.push(['Total time', formatCookTime(post.cookTimeMinutes)]);
  if (post.mealType) facts.push(['Meal', post.mealType.name]);
  const names = (list: { name: string }[]) => list.map((c) => c.name).join(', ');
  // Cuisines show here only when the line under the title lists subcategories.
  if (post.cuisines.length > 0 && post.subcategories.length > 0) {
    facts.push([post.cuisines.length > 1 ? 'Cuisines' : 'Cuisine', names(post.cuisines)]);
  }
  if (post.dishTypes.length > 0) facts.push([post.dishTypes.length > 1 ? 'Dishes' : 'Dish', names(post.dishTypes)]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {facts.map(([label, value], i) => (
          <View key={label}>
            {i > 0 ? <Divider /> : null}
            <Row label={label}>{value}</Row>
          </View>
        ))}
      </View>

      {post.recipeUrl ? (
        <PressableScale
          onPress={() => void WebBrowser.openBrowserAsync(post.recipeUrl!)}
          accessibilityRole="link"
          accessibilityLabel="Open recipe"
          style={styles.recipe}
        >
          <View style={styles.recipeText}>
            <AppText variant="bodyStrong">Recipe</AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {post.recipeUrl.replace(/^https?:\/\/(www\.)?/, '')}
            </AppText>
          </View>
          <ExternalLink size={iconSizes.md} color={colors.textSecondary} strokeWidth={strokes.regular} />
        </PressableScale>
      ) : null}

      {post.ingredients ? <Block label="Ingredients" text={post.ingredients} /> : null}
      {post.prepNotes ? <Block label="How it was made" text={post.prepNotes} /> : null}
      {post.nextTimeNotes ? <Block label="Next time" text={post.nextTimeNotes} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  recipe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  recipeText: { flex: 1, gap: 2 },
  block: { gap: spacing.xs + 2 },
});
