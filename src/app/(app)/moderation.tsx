import { router } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppButton,
  AppHeader,
  AppText,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  RowSkeleton,
} from '@/components/ui';
import { REASON_LABELS, type ModerationAction, type QueueItem } from '@/features/moderation/api';
import { useIsModerator, useModerate, useModerationQueue } from '@/features/moderation/hooks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { colors, HAIRLINE, radii, SCREEN_GUTTER, spacing } from '@/theme';
import { formatRelativeTime } from '@/utils/dates';

const NOUN = { post: 'Post', comment: 'Comment', user: 'Account' } as const;

interface Pending {
  item: QueueItem;
  action: ModerationAction;
  /** Suspending acts on the owner, whatever was reported. */
  onOwner?: boolean;
}

/**
 * The report review queue (moderators only). Every open report, grouped by
 * what was reported, oldest first, so nothing waits past 24 hours.
 */
export default function ModerationScreen() {
  const insets = useSafeAreaInsets();
  const isModerator = useIsModerator();
  const queue = useModerationQueue(isModerator.data === true);
  const moderate = useModerate();
  const [pending, setPending] = useState<Pending | null>(null);
  const { refreshing, onRefresh } = usePullToRefresh(() => queue.refetch());

  const run = async ({ item, action, onOwner }: Pending) => {
    const targetType = onOwner ? 'user' : item.targetType;
    const targetId = onOwner ? item.ownerId : item.targetId;
    if (!targetId) return;
    try {
      await moderate.mutateAsync({ targetType, targetId, action });
      toast.success(
        action === 'dismiss' ? 'Reports dismissed' : action === 'suspend' ? 'Account suspended' : 'Done',
      );
    } catch (error) {
      toast.error(toUserMessage(error, 'That didn’t work. Try again.'));
    }
  };

  if (isModerator.isPending)
    return (
      <Screen>
        <RowSkeleton />
      </Screen>
    );
  if (isModerator.data !== true) {
    return (
      <Screen>
        <EmptyState
          icon={ShieldCheck}
          title="Moderators only"
          message="This screen is for Cheffy’s review team."
        />
      </Screen>
    );
  }

  const items = queue.data ?? [];
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        }
      >
        {queue.isPending ? (
          <RowSkeleton />
        ) : queue.isError ? (
          <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="All clear" message="No open reports." />
        ) : (
          items.map((item) => (
            <View key={`${item.targetType}:${item.targetId}`} style={styles.card}>
              <View style={styles.cardTop}>
                <AppText variant="overline" color="textSecondary">
                  {NOUN[item.targetType]} · {item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'}
                </AppText>
                <AppText variant="caption" color="textTertiary">
                  {formatRelativeTime(item.firstReported)}
                </AppText>
              </View>
              {item.isHidden ? (
                <AppText variant="caption" color="danger">
                  {item.targetType === 'user' ? 'Suspended' : 'Hidden from others'}
                </AppText>
              ) : null}
              <AppText variant="body" numberOfLines={6}>
                {item.preview ?? '(content no longer exists)'}
              </AppText>
              {item.ownerUsername ? (
                <AppText
                  variant="calloutStrong"
                  color="accent"
                  onPress={() =>
                    item.ownerId && router.push({ pathname: '/user/[id]', params: { id: item.ownerId } })
                  }
                  accessibilityRole="link"
                >
                  @{item.ownerUsername}
                </AppText>
              ) : null}
              <AppText variant="caption" color="textSecondary">
                {item.reasons.map((r) => REASON_LABELS[r] ?? r).join(' · ')}
              </AppText>
              {item.details.map((d, i) => (
                <AppText key={i} variant="caption" color="textSecondary" style={styles.detail}>
                  “{d}”
                </AppText>
              ))}

              <View style={styles.actions}>
                {item.targetType !== 'user' ? (
                  item.isHidden ? (
                    <AppButton
                      label="Restore"
                      size="sm"
                      variant="secondary"
                      onPress={() => setPending({ item, action: 'restore' })}
                    />
                  ) : (
                    <AppButton
                      label="Remove"
                      size="sm"
                      variant="destructive"
                      onPress={() => setPending({ item, action: 'remove' })}
                    />
                  )
                ) : null}
                <AppButton
                  label="Dismiss"
                  size="sm"
                  variant="secondary"
                  onPress={() => setPending({ item, action: 'dismiss' })}
                />
                {item.ownerId ? (
                  <AppButton
                    label={item.targetType === 'user' ? 'Suspend' : 'Suspend author'}
                    size="sm"
                    variant="ghost"
                    onPress={() => setPending({ item, action: 'suspend', onOwner: true })}
                  />
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <ConfirmationDialog
        visible={!!pending}
        title={
          pending?.action === 'suspend'
            ? `Suspend @${pending.item.ownerUsername ?? 'this account'}?`
            : pending?.action === 'remove'
              ? `Remove this ${pending.item.targetType}?`
              : pending?.action === 'restore'
                ? 'Restore it?'
                : 'Dismiss these reports?'
        }
        message={
          pending?.action === 'suspend'
            ? 'They’ll be signed out and can’t sign back in. Their posts and comments are taken down. You can undo this.'
            : pending?.action === 'remove'
              ? 'It disappears for everyone except its author, who sees that it was removed.'
              : pending?.action === 'restore'
                ? 'It becomes visible again and the reports are closed.'
                : 'The content stays up and the reports are closed.'
        }
        confirmLabel={
          pending?.action === 'suspend'
            ? 'Suspend'
            : pending?.action === 'remove'
              ? 'Remove'
              : pending?.action === 'restore'
                ? 'Restore'
                : 'Dismiss'
        }
        destructive={pending?.action === 'suspend' || pending?.action === 'remove'}
        onConfirm={async () => {
          if (pending) await run(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <AppHeader title="Moderation" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: SCREEN_GUTTER, gap: spacing.md },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detail: { fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
