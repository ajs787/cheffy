import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';

interface FormSectionProps {
  title: string;
  /** Quiet note beside the title, e.g. "Optional". */
  hint?: string;
  children: ReactNode;
  /** Let children scroll edge to edge. */
  bleed?: boolean;
  /** Extra room above, to separate it from the optional sections. */
  spaced?: boolean;
}

/** A labeled block in the compose form. */
export function FormSection({ title, hint, children, bleed = false, spaced = false }: FormSectionProps) {
  return (
    <View style={[styles.section, spaced && styles.spaced]}>
      <View style={styles.titleRow}>
        <AppText variant="overline" color="textSecondary">
          {title}
        </AppText>
        {hint ? (
          <AppText variant="caption" color="textTertiary">
            {hint}
          </AppText>
        ) : null}
      </View>
      <View style={bleed ? undefined : styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  spaced: { marginTop: spacing.md },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
  },
  content: { paddingHorizontal: SCREEN_GUTTER },
});
