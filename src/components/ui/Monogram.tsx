import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

/** The "c." monogram on an oxblood tile (ivory letter, rose full stop). */
export function Monogram({ size = 40 }: { size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.24 }]}
    >
      <Text
        allowFontScaling={false}
        style={{ fontFamily: fonts.display, fontSize: size * 0.62, lineHeight: size * 0.8, color: colors.ivory }}
      >
        c<Text style={{ color: colors.rose }}>.</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.oxblood, alignItems: 'center', justifyContent: 'center' },
});
