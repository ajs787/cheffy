import { StyleSheet, View } from 'react-native';

import { colors, fonts, MAX_FONT_SCALE } from '@/theme';
import { formatRating, ratingColor } from '@/utils/rating';

import { AppText } from './AppText';

const BADGE_SIZES = { sm: 34, md: 42, lg: 56 } as const;

export interface RatingDisplayProps {
  value: number | null;
  variant?: 'badge' | 'inline';
  size?: keyof typeof BADGE_SIZES;
}

/** A rating number colored by tier. `badge` is a ring; `inline` is plain text. */
export function RatingDisplay({ value, variant = 'badge', size = 'md' }: RatingDisplayProps) {
  const color = ratingColor(value);
  const label = value === null ? 'Not rated' : `Rated ${formatRating(value)} out of 10`;

  if (variant === 'inline') {
    return (
      <AppText
        accessibilityLabel={label}
        style={[styles.inline, { color, fontSize: size === 'lg' ? 22 : size === 'md' ? 17 : 15 }]}
      >
        {formatRating(value)}
      </AppText>
    );
  }

  const d = BADGE_SIZES[size];
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.badge, { width: d, height: d, borderRadius: d / 2, borderColor: color }]}
    >
      <AppText
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[styles.badgeText, { color, fontSize: d * 0.36, lineHeight: d * 0.44 }]}
      >
        {formatRating(value)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { fontFamily: fonts.serif, fontVariant: ['tabular-nums'] },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  badgeText: { fontFamily: fonts.serif, fontVariant: ['tabular-nums'] },
});
