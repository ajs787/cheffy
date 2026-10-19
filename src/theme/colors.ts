/** Color tokens. See DESIGN_SYSTEM.md for contrast notes. */
export const colors = {
  background: '#FAF9F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F1EC',
  surfacePressed: '#EEEBE5',

  text: '#222222',
  textSecondary: '#6F6B66',
  textTertiary: '#8A817A',
  textInverse: '#FFFFFF',

  accent: '#D95D47',
  accentStrong: '#BE4B36',
  accentSoft: '#FBEAE6',

  sage: '#82947B',
  sageStrong: '#5F7259',
  sageSoft: '#EDF0EA',

  border: '#E9E6E1',
  borderStrong: '#D9D4CC',

  danger: '#B3261E',
  dangerSoft: '#FBE9E7',

  overlay: 'rgba(24, 20, 16, 0.42)',
  imageScrim: 'rgba(0, 0, 0, 0.35)',
} as const;

export type ColorToken = keyof typeof colors;

/** Category identity colors (dots, icons). Unknown slugs fall back to sage. */
export const categoryColors: Record<string, string> = {
  cooking: '#D95D47',
  baking: '#C8913A',
  drinks: '#82947B',
};

export const ratingColors = {
  great: '#3D7A50',
  good: '#97701F',
  low: '#8A817A',
} as const;
