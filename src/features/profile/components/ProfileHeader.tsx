import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { FollowButton } from '@/components/shared/FollowButton';
import { AppButton, AppText, Avatar, categoryColorFor } from '@/components/ui';
import { shareProfile } from '@/lib/share';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { ProfileStats, ProfileWithViewer } from '@/types/models';
import { formatCount } from '@/utils/format';

function Stat({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.stat}
      accessibilityRole={onPress ? 'link' : 'text'}
      accessibilityLabel={`${value} ${label}`}
    >
      <AppText variant="title2">{formatCount(value)}</AppText>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
    </Pressable>
  );
}

export function ProfileHeader({
  profile,
  stats,
  isOwn,
}: {
  profile: ProfileWithViewer;
  stats: ProfileStats | undefined;
  isOwn: boolean;
}) {
  const openConnections = (type: 'followers' | 'following') =>
    router.push({ pathname: '/user/[id]/connections', params: { id: profile.id, type } });

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Avatar uri={profile.avatarUrl} name={profile.displayName} size="lg" />
        <View style={styles.stats}>
          <Stat value={stats?.posts ?? 0} label="creations" />
          <Stat value={stats?.followers ?? 0} label="followers" onPress={() => openConnections('followers')} />
          <Stat value={stats?.following ?? 0} label="following" onPress={() => openConnections('following')} />
        </View>
      </View>

      <View style={styles.identity}>
        <AppText variant="title1" accessibilityRole="header">
          {profile.displayName}
        </AppText>
        <AppText variant="callout" color="textSecondary">
          @{profile.username}
        </AppText>
        {profile.bio ? (
          <AppText variant="body" style={styles.bio}>
            {profile.bio}
          </AppText>
        ) : null}
      </View>

      {stats && stats.byPrimary.length > 0 ? (
        <View style={styles.breakdown} accessible accessibilityLabel={stats.byPrimary.map((p) => `${p.count} ${p.name}`).join(', ')}>
          {stats.byPrimary.map((primary) => (
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
            <AppButton label="Edit profile" variant="secondary" size="sm" style={styles.flex} onPress={() => router.push('/edit-profile')} />
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
            <FollowButton userId={profile.id} following={profile.viewerIsFollowing} size="sm" />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.lg, paddingBottom: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', minWidth: 64, minHeight: 44, justifyContent: 'center' },
  identity: { gap: 2 },
  bio: { marginTop: spacing.sm },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  breakdownItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
