import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, AppText } from '@/components/ui';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

export interface AuthScaffoldProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
}

/** Shared layout for auth & onboarding: header, editorial title, keyboard-safe form. */
export function AuthScaffold({ title, subtitle, children, footer, showBack = true }: AuthScaffoldProps) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {showBack ? <AppHeader /> : <View style={{ height: insets.top + spacing.lg }} />}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.heading}>
          <AppText variant="display" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="body" color="textSecondary">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={styles.form}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: SCREEN_GUTTER + spacing.xs, flexGrow: 1 },
  heading: { gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.xxl },
  form: { gap: spacing.lg },
  footer: { marginTop: spacing.xxl, alignItems: 'center', gap: spacing.sm },
});
