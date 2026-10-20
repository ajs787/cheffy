import type { TextStyle } from 'react-native';

/**
 * Display — DM Serif Display: a sturdy, high-contrast display serif that keeps
 * the identity's Didone character but stays bold and legible at app sizes.
 * Text and labels — Newsreader. Registered in the root layout.
 */
export const fonts = {
  display: 'DMSerifDisplay_400Regular',
  text: 'Newsreader_400Regular',
  textMedium: 'Newsreader_500Medium',
  textSemiBold: 'Newsreader_600SemiBold',
} as const;

export const typography = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 39, letterSpacing: -0.3 },
  title1: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.2 },
  title2: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24 },
  title3: { fontFamily: fonts.textSemiBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.text, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.textSemiBold, fontSize: 16, lineHeight: 23 },
  callout: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21 },
  calloutStrong: { fontFamily: fonts.textSemiBold, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.textMedium, fontSize: 13, lineHeight: 17 },
  /** Newsreader tracked capitals, the identity's label style. */
  overline: {
    fontFamily: fonts.textSemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  button: { fontFamily: fonts.textSemiBold, fontSize: 16, lineHeight: 20, letterSpacing: 0.2 },
  rating: { fontFamily: fonts.display, fontSize: 60, lineHeight: 66, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

/** Cap Dynamic Type so layouts stay intact at large accessibility sizes. */
export const MAX_FONT_SCALE = 1.3;
