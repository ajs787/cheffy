import { StyleSheet } from 'react-native';

import { fonts } from '@/theme';
import { formatRating, ratingColor } from '@/utils/rating';

import { AppText } from './AppText';
import { RatingRing, RING_SIZES } from './RatingRing';

export interface RatingDisplayProps {
  value: number | null;
  variant?: 'badge' | 'inline';
  size?: keyof typeof RING_SIZES;
}

/** A rating: `badge` is the progress ring (RatingRing); `inline` is plain text. */
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

  return <RatingRing value={value} size={size} />;
}

const styles = StyleSheet.create({
  inline: { fontFamily: fonts.display, fontVariant: ['tabular-nums'] },
});
