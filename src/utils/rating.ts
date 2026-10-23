import { colors as palette, ratingScale } from '@/theme';

export const RATING_MIN = 0;
export const RATING_MAX = 10;

export function clampRating(value: number): number {
  if (Number.isNaN(value)) return RATING_MIN;
  return Math.min(RATING_MAX, Math.max(RATING_MIN, value));
}

/** Clamps to 0–10 and rounds to one decimal place (avoids 0.1 float drift). */
export function roundRating(value: number): number {
  return Math.round(clampRating(value) * 10) / 10;
}

export function stepRating(value: number, steps: number): number {
  return roundRating(Math.round(value * 10 + steps) / 10);
}

export function formatRating(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return roundRating(value).toFixed(1);
}

// ---------------------------------------------------------------------------
// Color: one red → bright-green scale for every ring, slider and number.
// Blending happens in OKLab so the in-between colors look evenly spaced
// (plain RGB blending goes muddy between orange and green).
// ---------------------------------------------------------------------------
type Rgb = [number, number, number];

const hexToRgb = (c: string): Rgb => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as Rgb;
const rgbToHex = (rgb: Rgb) =>
  `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const ANCHORS = ratingScale.stops.map((stop, i) => ({
  stop,
  lab: rgbToOklab(hexToRgb(ratingScale.colors[i]!)),
}));

/** Shown for "not rated yet". */
export const UNRATED_COLOR = palette.textTertiary;

/** The scale color for a rating: rings, the slider track, fills. */
export function ratingColor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return UNRATED_COLOR;
  const v = clampRating(value);
  for (let i = 1; i < ANCHORS.length; i++) {
    const lo = ANCHORS[i - 1]!;
    const hi = ANCHORS[i]!;
    if (v <= hi.stop) {
      const t = (v - lo.stop) / (hi.stop - lo.stop);
      return rgbToHex(oklabToRgb(lo.lab.map((x, k) => x + (hi.lab[k]! - x) * t) as Rgb));
    }
  }
  return ratingScale.colors[ratingScale.colors.length - 1]!.toLowerCase();
}

const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The same color, deepened just enough to read as text on ivory (WCAG: 4.5
 * for normal text, 3 for large numbers). Bright yellow-green and green need
 * this; reds and oranges barely change.
 */
export function ratingTextColor(value: number | null | undefined, minContrast = 4.5): string {
  const base = ratingColor(value);
  if (value === null || value === undefined) return base;
  const lab = rgbToOklab(hexToRgb(base));
  for (let L = lab[0]; L > 0.2; L -= 0.01) {
    const candidate = rgbToHex(oklabToRgb([L, lab[1], lab[2]]));
    if (contrastRatio(candidate, palette.background) >= minContrast) return candidate;
  }
  return palette.text;
}

/**
 * Dense stops for animated color (Reanimated blends linearly in RGB, so
 * closely spaced OKLab samples keep the animation as smooth as the scale).
 */
export const RATING_COLOR_STOPS: number[] = Array.from({ length: 21 }, (_, i) => i / 2);
export const RATING_COLOR_VALUES: string[] = RATING_COLOR_STOPS.map((v) => ratingColor(v));

/** Fraction of the ring to fill: rating / 10, clamped. */
export function ratingFill(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return clampRating(value) / RATING_MAX;
}

/**
 * Parses what someone typed into the exact-rating field.
 * Accepts "9.2", "9,2", ".5" and the shorthand "92" → 9.2 / "100" → 10.0.
 * Returns null when the text isn't a valid rating.
 */
export function parseRatingInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '' || !/^\d*\.?\d*$/.test(normalized) || normalized === '.') return null;
  let value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  if (!normalized.includes('.') && value > RATING_MAX && value <= RATING_MAX * 10) {
    value = value / 10;
  }
  if (value < RATING_MIN || value > RATING_MAX) return null;
  return roundRating(value);
}

/** A few words that make a number feel like a judgement. */
export function ratingDescriptor(value: number | null): string {
  if (value === null) return 'Slide to rate';
  if (value >= 9.5) return 'Best I’ve made';
  if (value >= 9) return 'Exceptional';
  if (value >= 8) return 'Really good';
  if (value >= 7) return 'Good';
  if (value >= 6) return 'Decent';
  if (value >= 4) return 'Needs work';
  return 'Didn’t work out';
}
