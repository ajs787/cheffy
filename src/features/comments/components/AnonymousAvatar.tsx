import { ChefHat } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, strokes } from '@/theme';

const SIZES = { xs: 24, sm: 32 } as const;

/** The generic chef-hat avatar every anonymous take shares. */
export function AnonymousAvatar({ size = 'sm' }: { size?: keyof typeof SIZES }) {
  const d = SIZES[size];
  return (
    <View
      style={[styles.circle, { width: d, height: d, borderRadius: d / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <ChefHat size={Math.round(d * 0.56)} color={colors.accent} strokeWidth={strokes.regular} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint },
});
