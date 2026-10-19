import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, HAIRLINE } from '@/theme';

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.line, { marginLeft: inset }, style]} />;
}

const styles = StyleSheet.create({
  line: { height: HAIRLINE, backgroundColor: colors.border },
});
