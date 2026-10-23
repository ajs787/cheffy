/**
 * Color tokens from the Cheffy identity ("The Cellar"): Oxblood, Ivory,
 * Espresso and Crème. See DESIGN_SYSTEM.md for roles and contrast.
 */
const brand = {
  oxblood: '#6B2737',
  ivory: '#F7F1E8',
  espresso: '#3B2A22',
  creme: '#EADFD0',
  rose: '#B87484',
} as const;

export const colors = {
  ...brand,

  background: brand.ivory,
  /** Lifted paper for inputs and sheets. */
  surface: '#FCF9F4',
  /** Image placeholders and skeletons. */
  surfaceMuted: '#EFE7DC',
  surfacePressed: '#E4D7C5',
  /** Crème: quiet fills (tags, chips, cards, banners). */
  tint: brand.creme,

  text: brand.espresso,
  textSecondary: '#6F5F55',
  textTertiary: '#8C7B6E',
  textInverse: brand.ivory,

  accent: brand.oxblood,
  accentStrong: brand.oxblood,
  accentSoft: '#F0E2DE',

  /** Soft hairlines (inputs, chips, list separators). */
  border: '#DFD3C3',
  borderStrong: '#CDBEAA',
  /** Espresso rule: the strong hairline of editorial cards and sections. */
  rule: brand.espresso,

  danger: '#A1261D',
  dangerSoft: '#F6E3DF',

  overlay: 'rgba(59, 42, 34, 0.45)',
  imageScrim: 'rgba(59, 42, 34, 0.38)',
} as const;

export type ColorToken = keyof typeof colors;

/** Category identity dots (decorative; always paired with a label). Unknown slugs fall back to rose. */
export const categoryColors: Record<string, string> = {
  cooking: brand.oxblood,
  baking: '#B08452',
  drinks: brand.rose,
};

/**
 * The rating scale, 0 (red) to 10 (bright green). Colors sit at these
 * ratings and blend evenly (in OKLab) in between — see utils/rating. This is
 * the one place the scale is defined; every ring, slider and number uses it.
 */
export const ratingScale = {
  stops: [0, 2, 4, 5, 6.5, 8, 10],
  colors: ['#E5484D', '#F16A43', '#F5A524', '#E9C746', '#A9C94D', '#53B96B', '#20C967'],
} as const;

/** Unlockable profile accents. Each keeps AA contrast on ivory. */
export const profileThemes = {
  default: { accent: brand.oxblood, soft: '#EFE3E3' },
  saffron: { accent: '#8A5A12', soft: '#F3E6CC' },
} as const;
