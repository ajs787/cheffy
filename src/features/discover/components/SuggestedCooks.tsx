import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { followStateOf } from '@/types/models';
import { FollowButton } from '@/components/shared/FollowButton';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { AppText, Avatar, PressableScale } from '@/components/ui';
import { useSuggestedCooks } from '@/features/social/hooks';
import { colors, radii, SCREEN_GUTTER, spacing } from '@/theme';

export function SuggestedCooks() {
  const cooks = useSuggestedCooks();
  const people = cooks.data ?? [];
  if (people.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title="Home cooks to follow" subtitle="People logging what they make" />
      <FlatList
        horizontal
        data={people}
        keyExtractor={(user) => user.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => (
          <PressableScale
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}
            activeScale={0.97}
            accessibilityRole="link"
            accessibilityLabel={`${item.displayName}, @${item.username}`}
            style={styles.card}
          >
            <Avatar uri={item.avatarUrl} name={item.displayName} size="lg" />
            <View style={styles.names}>
              <AppText variant="calloutStrong" numberOfLines={1} align="center">
                {item.displayName}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1} align="center">
                @{item.username}
              </AppText>
            </View>
            <FollowButton userId={item.id} state={followStateOf(item)} isPrivate={item.isPrivate} />
          </PressableScale>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xxl },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
  card: {
    width: 148,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  names: { alignSelf: 'stretch' },
});
