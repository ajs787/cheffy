import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';

/** A labeled block in the compose form. `bleed` lets children scroll edge to edge. */
export function FormSection({ title, children, bleed = false }: { title: string; children: ReactNode; bleed?: boolean }) {
  return (
    <View style={styles.section}>
      <AppText variant="overline" color="textSecondary" style={styles.title}>
        {title}
      </AppText>
      <View style={bleed ? undefined : styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm + 2 },
  title: { paddingHorizontal: SCREEN_GUTTER },
  content: { paddingHorizontal: SCREEN_GUTTER },
});
