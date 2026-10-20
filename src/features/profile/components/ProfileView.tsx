import { router } from 'expo-router';
import { Ban, Ellipsis, Settings, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  ErrorState,
  GridSkeleton,
  IconButton,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { useUnblockUser } from '@/features/social/hooks';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

import { useProfile, useProfileStats } from '../hooks';
import { ProfileHeader } from './ProfileHeader';
import { ProfileMenu } from './ProfileMenu';
import { CollectionsTab, DiaryTab, RankingsTab } from './ProfileTabs';

type Tab = 'diary' | 'rankings' | 'collections';

const TABS = [
  { value: 'diary', label: 'Diary' },
  { value: 'rankings', label: 'Rankings' },
  { value: 'collections', label: 'Collections' },
] as const;

const TAB_COMPONENTS = { diary: DiaryTab, rankings: RankingsTab, collections: CollectionsTab };

export interface ProfileViewProps {
  userId: string;
  isOwn: boolean;
  /** The Profile tab itself (no Back button); false when pushed onto a stack. */
  isTabRoot?: boolean;
}

/** A cooking portfolio. Used for your own Profile tab and for other people. */
export function ProfileView({ userId, isOwn, isTabRoot = false }: ProfileViewProps) {
  const profile = useProfile(userId);
  const stats = useProfileStats(userId);
  const unblock = useUnblockUser();
  const [tab, setTab] = useState<Tab>('diary');
  const [menuOpen, setMenuOpen] = useState(false);

  const settingsButton = (
    <IconButton icon={Settings} label="Settings" onPress={() => router.push('/settings')} />
  );
  // Profile tab: "@username" + settings (the logo lives on Home only); pushed: Back.
  const topBar = isTabRoot ? (
    <AppHeader
      title={profile.data ? `@${profile.data.username}` : ''}
      leading="none"
      right={settingsButton}
    />
  ) : isOwn ? (
    <AppHeader title={profile.data ? `@${profile.data.username}` : ''} right={settingsButton} />
  ) : (
    <AppHeader
      right={
        profile.data ? (
          <IconButton icon={Ellipsis} label="More options" onPress={() => setMenuOpen(true)} />
        ) : null
      }
    />
  );

  if (profile.isPending) {
    return (
      <View style={styles.screen}>
        {topBar}
        <View style={styles.loadingHeader}>
          <Skeleton width={72} height={72} radius={36} />
          <Skeleton width="50%" height={22} />
          <Skeleton width="30%" height={14} />
        </View>
        <GridSkeleton />
      </View>
    );
  }

  if (profile.isError && !profile.data) {
    return (
      <View style={styles.screen}>
        {topBar}
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      </View>
    );
  }

  if (!profile.data) {
    return (
      <View style={styles.screen}>
        {topBar}
        <EmptyState
          icon={UserX}
          title="Profile not available"
          message="This account doesn’t exist or isn’t visible to you."
        />
      </View>
    );
  }

  const p = profile.data;
  const menu = isOwn ? null : (
    <ProfileMenu profile={p} visible={menuOpen} onClose={() => setMenuOpen(false)} />
  );

  if (p.viewerHasBlocked) {
    return (
      <View style={styles.screen}>
        {topBar}
        <EmptyState
          icon={Ban}
          title={`You blocked @${p.username}`}
          message="Unblock to see their posts and let them see yours again."
          actionLabel="Unblock"
          onAction={() => unblock.mutate(p.id)}
        />
        {menu}
      </View>
    );
  }

  const ActiveTab = TAB_COMPONENTS[tab];
  return (
    <View style={styles.screen}>
      {topBar}
      <ActiveTab
        key={tab}
        userId={userId}
        isOwn={isOwn}
        name={isOwn ? 'You' : (p.displayName.split(' ')[0] ?? p.displayName)}
        onRefreshProfile={() => Promise.all([profile.refetch(), stats.refetch()])}
        header={
          <View>
            <ProfileHeader profile={p} stats={stats.data} isOwn={isOwn} usernameInTitle={isOwn} />
            <SegmentedControl options={TABS} value={tab} onChange={setTab} />
          </View>
        }
      />
      {menu}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loadingHeader: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md, paddingBottom: spacing.xl },
});
