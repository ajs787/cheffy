import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { Bell, ChevronRight, UserCheck } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppHeader, AppText, EmptyState, ErrorState, PressableScale, RowSkeleton } from '@/components/ui';
import type { ActivityItem } from '@/features/activity/api';
import { ActivityRow } from '@/features/activity/components/ActivityRow';
import { useActivity } from '@/features/activity/hooks';
import { useFollowRequests } from '@/features/social/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useActivitySeenStore } from '@/stores/activity';
import { colors, iconSizes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';

type Row = { type: 'heading'; label: string } | { type: 'item'; item: ActivityItem };

export default function ActivityScreen() {
  const activity = useActivity();
  const markSeen = useActivitySeenStore((s) => s.markSeen);
  // Split at the previous visit so new items stand out, then mark this visit.
  const [seenAt] = useState(() => useActivitySeenStore.getState().seenAt);
  useFocusEffect(useCallback(() => () => markSeen(), [markSeen]));
  const requests = useFollowRequests();
  const pending = requests.data?.length ?? 0;
  const { refreshing, onRefresh } = usePullToRefresh(() => Promise.all([activity.refetch(), requests.refetch()]));

  const items = activity.data ?? [];
  const fresh = items.filter((i) => !seenAt || i.at > seenAt);
  const earlier = items.filter((i) => seenAt && i.at <= seenAt);
  const rows: Row[] = [
    ...(fresh.length ? [{ type: 'heading' as const, label: 'New' }, ...fresh.map((item) => ({ type: 'item' as const, item }))] : []),
    ...(earlier.length
      ? [{ type: 'heading' as const, label: 'Earlier' }, ...earlier.map((item) => ({ type: 'item' as const, item }))]
      : []),
  ];

  return (
    <View style={styles.screen}>
      <AppHeader title="Activity" />
      {activity.isPending ? (
        <RowSkeleton />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(row) => (row.type === 'heading' ? `h:${row.label}` : row.item.key)}
          getItemType={(row) => row.type}
          ListHeaderComponent={pending > 0 ? <FollowRequestsRow count={pending} /> : null}
          renderItem={({ item: row }) =>
            row.type === 'heading' ? (
              <AppText variant="overline" color="textSecondary" style={styles.heading}>
                {row.label}
              </AppText>
            ) : (
              <ActivityRow item={row.item} />
            )
          }
          ListEmptyComponent={
            <EmptyState
              icon={Bell}
              title="Nothing yet"
              message="When people like or comment on your entries, or follow you, it shows up here."
            />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
        />
      )}
    </View>
  );
}

function FollowRequestsRow({ count }: { count: number }) {
  return (
    <PressableScale
      onPress={() => router.push('/follow-requests')}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${count} follow ${count === 1 ? 'request' : 'requests'}`}
      style={styles.requests}
    >
      <View style={styles.requestsIcon}>
        <UserCheck size={iconSizes.md} color={colors.ivory} strokeWidth={strokes.regular} />
      </View>
      <View style={styles.requestsText}>
        <AppText variant="bodyStrong">Follow requests</AppText>
        <AppText variant="caption" color="textSecondary">
          {count} waiting for you to approve
        </AppText>
      </View>
      <ChevronRight size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  requests: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: SCREEN_GUTTER,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.tint,
  },
  requestsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  requestsText: { flex: 1, gap: 2 },
  screen: { flex: 1, backgroundColor: colors.background },
  heading: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.lg, paddingBottom: spacing.xs },
});
