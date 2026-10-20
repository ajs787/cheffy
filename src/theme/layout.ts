export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/** Editorial and squared-off: cards are near-square, tiles echo the app icon. */
export const radii = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 12,
  pill: 999,
} as const;

export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
} as const;

export const strokes = {
  regular: 1.75,
  bold: 2.25,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#3B2A22',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

/** Minimum touch target (Apple HIG). */
export const HIT_TARGET = 44;
export const SCREEN_GUTTER = spacing.lg;
export const HAIRLINE = 1;
