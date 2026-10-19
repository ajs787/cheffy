import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, SCREEN_GUTTER, spacing, strokes } from '@/theme';

export function SectionHeader({
  title,
  subtitle,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="title2" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {onSeeAll ? (
        <Pressable
          onPress={onSeeAll}
          hitSlop={10}
          style={styles.seeAll}
          accessibilityRole="button"
          accessibilityLabel={`See all ${title}`}
        >
          <AppText variant="calloutStrong" color="textSecondary">
            See all
          </AppText>
          <ChevronRight size={16} color={colors.textSecondary} strokeWidth={strokes.bold} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SCREEN_GUTTER,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  text: { flex: 1, gap: 2 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 2 },
});
