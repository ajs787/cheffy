import { StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';
import type { ProfileStats, ProfileWithViewer } from '@/types/models';

/** Categories someone logs most, e.g. "Baking · Drinks". */
export function specialties(stats: ProfileStats | undefined): string {
  const top = (stats?.byPrimary ?? [])
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((p) => p.name);
  return top.length > 0 ? top.join(' · ') : 'New member';
}

/** The identity's oxblood membership card, used as the profile hero. */
export function MembershipCard({
  profile,
  stats,
  showUsername = true,
}: {
  profile: ProfileWithViewer;
  stats: ProfileStats | undefined;
  /** Off when the screen title already shows the @username. */
  showUsername?: boolean;
}) {
  const since = new Date(profile.createdAt).getFullYear();
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${profile.displayName}, @${profile.username}. Member since ${since}. ${specialties(stats)}.`}
    >
      <View style={styles.top}>
        <View style={styles.member}>
          <AppText variant="overline" style={styles.ivory}>
            Membre
          </AppText>
          <AppText variant="overline" style={styles.rose}>
            Depuis {since}
          </AppText>
        </View>
        <View style={styles.avatarRing}>
          <Avatar uri={profile.avatarUrl} name={profile.displayName} size="lg" />
        </View>
      </View>
      <View style={styles.identity}>
        <AppText variant="display" numberOfLines={1} style={styles.ivory} accessibilityRole="header">
          {profile.displayName}
        </AppText>
        <AppText variant="overline" numberOfLines={1} style={styles.rose}>
          {showUsername ? `@${profile.username} · ` : ''}
          {specialties(stats)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1.9,
    justifyContent: 'space-between',
    padding: spacing.lg + 4,
    borderRadius: radii.lg,
    backgroundColor: colors.oxblood,
    ...shadows.sm,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  member: { gap: 2 },
  identity: { gap: spacing.xs },
  avatarRing: { padding: 2, borderRadius: 999, borderWidth: 1, borderColor: colors.rose },
  ivory: { color: colors.ivory },
  rose: { color: '#E3C4C9' },
});
