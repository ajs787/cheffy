import { Users } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fonts, HAIRLINE, strokes } from '@/theme';

/** A quiet mark on creations made with accepted co-creators. */
export function MadeTogetherTag() {
  return (
    <View style={styles.tag} accessible accessibilityLabel="Made together">
      <Users size={11} color={colors.textSecondary} strokeWidth={strokes.bold} />
      <AppText style={styles.text} maxFontSizeMultiplier={1.4}>
        Made together
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: HAIRLINE,
    borderColor: colors.rule,
  },
  text: {
    fontFamily: fonts.textSemiBold,
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
});
