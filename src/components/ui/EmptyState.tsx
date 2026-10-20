import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing, strokes } from '@/theme';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  style,
  compact = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.compact, style]}>
      {Icon ? (
        <View style={styles.iconWrap}>
          <Icon size={28} color={colors.accent} strokeWidth={strokes.regular} />
        </View>
      ) : null}
      <AppText variant="title2" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="callout" color="textSecondary" align="center" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} size="md" style={styles.action} />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <AppButton label={secondaryLabel} onPress={onSecondary} variant="ghost" size="sm" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.huge,
    gap: spacing.sm,
  },
  compact: { paddingVertical: spacing.xxl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  message: { maxWidth: 300 },
  action: { marginTop: spacing.md },
});
