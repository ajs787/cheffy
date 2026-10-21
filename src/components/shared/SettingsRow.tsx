import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale } from '@/components/ui';
import { colors, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';

export function SettingsRow({
  icon: Icon,
  label,
  value,
  onPress,
  destructive = false,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? colors.danger : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      activeScale={0.99}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={styles.row}
    >
      <Icon size={iconSizes.md} color={color} strokeWidth={strokes.regular} />
      <AppText variant="body" color={destructive ? 'danger' : 'text'} style={styles.label}>
        {label}
      </AppText>
      {value ? (
        <AppText variant="callout" color="textSecondary">
          {value}
        </AppText>
      ) : null}
      {onPress && !destructive ? (
        <ChevronRight size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
      ) : null}
    </PressableScale>
  );
}

export function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <AppText variant="overline" color="textSecondary" style={styles.groupTitle}>
        {title}
      </AppText>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  label: { flex: 1 },
  group: { gap: spacing.sm },
  groupTitle: { paddingHorizontal: SCREEN_GUTTER },
  groupBody: {
    marginHorizontal: SCREEN_GUTTER,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});
