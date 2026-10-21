import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

export function ListFooter({ loading }: { loading: boolean }) {
  return (
    <View style={styles.footer}>{loading ? <ActivityIndicator color={colors.textTertiary} /> : null}</View>
  );
}

const styles = StyleSheet.create({
  footer: { height: 72, alignItems: 'center', justifyContent: 'center', paddingBottom: spacing.lg },
});
