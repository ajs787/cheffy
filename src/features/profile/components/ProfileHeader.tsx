import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { FollowButton } from '@/components/shared/FollowButton';
import { AppButton, AppText, categoryColorFor } from '@/components/ui';
import { shareProfile } from '@/lib/share';
import { colors, HAIRLINE, SCREEN_GUTTER, spacing } from '@/theme';
import { followStateOf, type ProfileStats, type ProfileWithViewer } from '@/types/models';
import { formatCount } from '@/utils/format';

import { MembershipCard } from './MembershipCard';

function Stat({
  value,
  label,
  onPress,
  divided = false,
}: {
  value: number;
  label: string;
  onPress?: () => void;
  divided?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.stat, divided && styles.statRule]}
      accessibilityRole={onPress ? 'link' : 'text'}
      accessibilityLabel={`${value} ${label}`}
    >
      <AppText variant="title2">{formatCount(value)}</AppText>
      <AppText variant="overline" color="textSecondary">
        {label}
      </AppText>
    </Pressable>
  );
}

export function ProfileHeader({
  profile,
  stats,
  isOwn,
  usernameInTitle = false,
}: {
  profile: ProfileWithViewer;
  stats: ProfileStats | undefined;
  isOwn: boolean;
  usernameInTitle?: boolean;
}) {
  const made = (stats?.byPrimary ?? []).filter((p) => p.count > 0);
  const openConnections = (type: 'followers' | 'following') =>
    router.push({ pathname: '/user/[id]/connections', params: { id: profile.id, type } });

  return (
    <View style={styles.container}>
      <MembershipCard profile={profile} stats={stats} showUsername={!usernameInTitle} />

      {profile.bio ? <AppText variant="body">{profile.bio}</AppText> : null}

      <View style={styles.stats}>
        <Stat value={stats?.posts ?? 0} label="creations" />
        <Stat
          value={stats?.followers ?? 0}
          label="followers"
          divided
          onPress={() => openConnections('followers')}
        />
        <Stat
          value={stats?.following ?? 0}
          label="following"
          divided
          onPress={() => openConnections('following')}
        />
      </View>

      {made.length > 1 ? (
        <View
          style={styles.breakdown}
          accessible
          accessibilityLabel={made.map((p) => `${p.count} ${p.name}`).join(', ')}
        >
          {made.map((primary) => (
            <View key={primary.slug} style={styles.breakdownItem}>
              <View style={[styles.dot, { backgroundColor: categoryColorFor(primary.slug) }]} />
              <AppText variant="calloutStrong">{formatCount(primary.count)}</AppText>
              <AppText variant="callout" color="textSecondary">
                {primary.name}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {isOwn ? (
          <>
            <AppButton
              label="Edit profile"
              variant="secondary"
              size="sm"
              style={styles.flex}
              onPress={() => router.push('/edit-profile')}
            />
            <AppButton
              label="Share profile"
              variant="secondary"
              size="sm"
              style={styles.flex}
              onPress={() => void shareProfile(profile).catch(() => undefined)}
            />
          </>
        ) : (
          <View style={styles.flex}>
            <FollowButton userId={profile.id} state={followStateOf(profile)} isPrivate={profile.isPrivate} size="sm" />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md, paddingBottom: spacing.md },
  // Rule-divided columns, as on the identity's cover.
  stats: {
    flexDirection: 'row',
    borderTopWidth: HAIRLINE,
    borderBottomWidth: HAIRLINE,
    borderColor: colors.rule,
  },
  stat: { flex: 1, alignItems: 'center', minHeight: 60, justifyContent: 'center', gap: 2 },
  statRule: { borderLeftWidth: HAIRLINE, borderLeftColor: colors.rule },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  breakdownItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
