import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { FollowButton } from '@/components/shared/FollowButton';
import { AppButton, AppText, Avatar, categoryColorFor } from '@/components/ui';
import { shareProfile } from '@/lib/share';
import { avatarForViewer, openImageViewer } from '@/stores/imageViewer';
import { colors, fonts, profileThemes, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import { followStateOf, type ProfileStats, type ProfileWithViewer } from '@/types/models';
import { formatMemberSince } from '@/utils/dates';
import { formatCount } from '@/utils/format';

import { SharedFavorites } from '@/features/rankings/components/SharedFavorites';

import { TopRatedPreview } from './TopRatedPreview';

function Stat({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'link' : 'text'}
      accessibilityLabel={`${value} ${label}`}
    >
      <AppText variant="title3" style={styles.statValue}>
        {formatCount(value)}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
    </Pressable>
  );
}

export interface ProfileHeaderProps {
  profile: ProfileWithViewer;
  stats: ProfileStats | undefined;
  isOwn: boolean;
  /** Shows the top-rated preview (when the viewer can see content). */
  showPreview?: boolean;
  onOpenRankings?: () => void;
}

/**
 * A compact social profile: photo and counts up top (Instagram-style), then
 * name, member line and bio, actions, what they make, and their top three.
 */
export function ProfileHeader({
  profile,
  stats,
  isOwn,
  showPreview = false,
  onOpenRankings,
}: ProfileHeaderProps) {
  const made = (stats?.byPrimary ?? []).filter((p) => p.count > 0);
  const photo = avatarForViewer(profile);
  const openConnections = (type: 'followers' | 'following') =>
    router.push({ pathname: '/user/[id]/connections', params: { id: profile.id, type } });

  const accent = profileThemes[profile.theme ?? 'default'].accent;

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Pressable
          disabled={!photo}
          onPress={() => photo && openImageViewer([photo])}
          style={({ pressed }) => [
            styles.avatarRing,
            { borderColor: accent },
            // Host's frame: a second, gold ring outside the first.
            profile.frame === 'host' && styles.hostFrame,
            pressed && styles.pressed,
          ]}
          accessibilityRole={photo ? 'imagebutton' : 'image'}
          accessibilityLabel={photo ? photo.label : `${profile.displayName}, no profile photo`}
          accessibilityHint={photo ? 'Opens the photo full screen' : undefined}
        >
          <Avatar uri={profile.avatarUrl} name={profile.displayName} size="profile" />
        </Pressable>
        <View style={styles.stats}>
          <Stat value={stats?.posts ?? 0} label={stats?.posts === 1 ? 'creation' : 'creations'} />
          <Stat
            value={stats?.followers ?? 0}
            label="followers"
            onPress={() => openConnections('followers')}
          />
          <Stat
            value={stats?.following ?? 0}
            label="following"
            onPress={() => openConnections('following')}
          />
        </View>
      </View>

      <View style={styles.identity}>
        <View style={styles.nameRow}>
          <AppText variant="bodyStrong" style={styles.name} numberOfLines={1} accessibilityRole="header">
            {profile.displayName}
          </AppText>
          {profile.isOgChef ? (
            <View
              style={styles.og}
              accessible
              accessibilityLabel="OG Chef, one of Cheffy’s first ten members"
            >
              <AppText style={styles.ogText} maxFontSizeMultiplier={1.4}>
                OG Chef
              </AppText>
            </View>
          ) : null}
          {profile.isPrivate ? (
            <Lock
              size={14}
              color={colors.textSecondary}
              strokeWidth={strokes.bold}
              accessibilityLabel="Private account"
            />
          ) : null}
        </View>
        {profile.bio ? (
          <AppText variant="callout" style={styles.bio}>
            {profile.bio}
          </AppText>
        ) : null}
        <AppText variant="caption" color="textTertiary" style={styles.memberSince}>
          Member since {formatMemberSince(profile.createdAt)}
        </AppText>
      </View>

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
          <>
            <View style={styles.flex}>
              <FollowButton
                userId={profile.id}
                state={followStateOf(profile)}
                isPrivate={profile.isPrivate}
                size="sm"
              />
            </View>
            <AppButton
              label="Share"
              variant="secondary"
              size="sm"
              onPress={() => void shareProfile(profile).catch(() => undefined)}
            />
          </>
        )}
      </View>

      {made.length > 0 ? (
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

      {!isOwn && showPreview ? <SharedFavorites friendId={profile.id} /> : null}

      {showPreview && onOpenRankings ? (
        <TopRatedPreview userId={profile.id} onSeeAll={onOpenRankings} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  pressed: { opacity: 0.6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  // A thin oxblood ring keeps the identity without the big card.
  avatarRing: { padding: 2, borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent },
  hostFrame: {
    padding: 4,
    borderWidth: 2,
    outlineColor: '#B8892E',
    outlineWidth: 1.5,
    outlineOffset: 2,
    outlineStyle: 'solid',
  },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', minWidth: 64, minHeight: 44, justifyContent: 'center' },
  statValue: { fontVariant: ['tabular-nums'] },
  identity: { gap: 2 },
  bio: { marginTop: spacing.xxs },
  // Understated: the quietest line in the header.
  memberSince: { marginTop: spacing.xs },
  // Small oxblood tag: Cheffy's first ten members.
  og: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: colors.oxblood,
  },
  ogText: {
    fontFamily: fonts.textSemiBold,
    fontSize: 10,
    lineHeight: 14,
    color: colors.ivory,
    letterSpacing: 0.5,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { fontFamily: fonts.textSemiBold, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  breakdownItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
