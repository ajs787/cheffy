import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppHeader, AppText, EmptyState, ErrorState, RowSkeleton } from '@/components/ui';
import type { ActivityItem } from '@/features/activity/api';
import { ActivityRow } from '@/features/activity/components/ActivityRow';
import { useActivity } from '@/features/activity/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useActivitySeenStore } from '@/stores/activity';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

type Row = { type: 'heading'; label: string } | { type: 'item'; item: ActivityItem };

export default function ActivityScreen() {
  const activity = useActivity();
  const markSeen = useActivitySeenStore((s) => s.markSeen);
  // Split at the previous visit so new items stand out, then mark this visit.
  const [seenAt] = useState(() => useActivitySeenStore.getState().seenAt);
  useFocusEffect(useCallback(() => () => markSeen(), [markSeen]));
  const { refreshing, onRefresh } = usePullToRefresh(() => activity.refetch());

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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  heading: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.lg, paddingBottom: spacing.xs },
});
