import type { TextStyle } from 'react-native';

/** Font family names as registered with expo-font in the root layout. */
export const fonts = {
  serif: 'Fraunces_600SemiBold',
  serifRegular: 'Fraunces_400Regular',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
} as const;

export const typography = {
  display: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  title1: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  title2: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  title3: { fontFamily: fonts.sansSemiBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.sansSemiBold, fontSize: 15, lineHeight: 22 },
  callout: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  calloutStrong: { fontFamily: fonts.sansSemiBold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  button: { fontFamily: fonts.sansSemiBold, fontSize: 16, lineHeight: 20 },
  rating: { fontFamily: fonts.serif, fontSize: 72, lineHeight: 80, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

/** Cap Dynamic Type so layouts stay intact at large accessibility sizes. */
export const MAX_FONT_SCALE = 1.3;
