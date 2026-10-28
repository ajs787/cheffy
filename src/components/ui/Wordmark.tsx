import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, MAX_FONT_SCALE } from '@/theme';

import { AppText } from './AppText';

const TONES = {
  /** All oxblood, full stop included: on Ivory or Crème. */
  oxblood: { letters: colors.oxblood, stop: colors.oxblood },
  /** Ivory letters, rose full stop: on Oxblood or Espresso. */
  ivory: { letters: colors.ivory, stop: colors.rose },
} as const;

export interface WordmarkProps {
  size?: number;
  tone?: keyof typeof TONES;
  /** Adds the "Club de cuisine" lock-up line beneath. */
  lockup?: boolean;
}

/** "cheffy." — the wordmark, set in the display serif with its signature full stop. */
export function Wordmark({ size = 30, tone = 'oxblood', lockup = false }: WordmarkProps) {
  const { letters, stop } = TONES[tone];
  const mark = (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Cheffy"
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={{
        fontFamily: fonts.display,
        fontSize: size,
        lineHeight: size * 1.15,
        letterSpacing: -size * 0.01,
        color: letters,
      }}
    >
      cheffy<Text style={{ color: stop }}>.</Text>
    </Text>
  );
  if (!lockup) return mark;
  return (
    <View style={styles.lockup}>
      {mark}
      <AppText variant="overline" style={{ color: tone === 'ivory' ? colors.ivory : colors.text }}>
        Club de cuisine
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center', gap: 2 },
});
