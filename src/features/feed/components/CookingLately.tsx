import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Avatar, PressableScale } from '@/components/ui';
import { useDiscoverSection } from '@/features/discover/hooks';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';
import type { Post, ProfileSummary } from '@/types/models';

const PARAMS = { sort: 'recent', followingOnly: true, sinceDays: 7 } as const;

/** People you follow who logged something this week (newest first, once each). */
export function recentCooks(posts: readonly Post[]): ProfileSummary[] {
  const seen = new Set<string>();
  const cooks: ProfileSummary[] = [];
  for (const post of posts) {
    if (!seen.has(post.author.id)) {
      seen.add(post.author.id);
      cooks.push(post.author);
    }
  }
  return cooks;
}

/** "Cooking lately": a compact strip of friends active this week. Hidden when empty. */
export function CookingLately() {
  const section = useDiscoverSection(PARAMS);
  const cooks = recentCooks(section.data ?? []);
  if (cooks.length === 0) return null;

  return (
    <View style={styles.module}>
      <AppText variant="overline" color="textSecondary" style={styles.label}>
        Cooking lately
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {cooks.map((cook) => (
          <PressableScale
            key={cook.id}
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: cook.id } })}
            activeScale={0.95}
            accessibilityRole="link"
            accessibilityLabel={`${cook.displayName} logged something this week`}
            style={styles.cook}
          >
            <View style={styles.ring}>
              <Avatar uri={cook.avatarUrl} name={cook.displayName} size="md" />
            </View>
            <AppText variant="caption" numberOfLines={1} style={styles.name}>
              {cook.displayName.split(' ')[0]}
            </AppText>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  module: { gap: spacing.sm, paddingTop: spacing.sm },
  label: { paddingHorizontal: SCREEN_GUTTER },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.lg },
  cook: { alignItems: 'center', gap: spacing.xs, width: 56 },
  ring: { padding: 2, borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent },
  name: { maxWidth: 56 },
});
