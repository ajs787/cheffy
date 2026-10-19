import { ratingColors } from '@/theme';

export const RATING_MIN = 0;
export const RATING_MAX = 10;

export type RatingTier = keyof typeof ratingColors;

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

export function ratingTier(value: number): RatingTier {
  if (value >= 8) return 'great';
  if (value >= 6) return 'good';
  return 'low';
}

export function ratingColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return ratingColors.low;
  return ratingColors[ratingTier(value)];
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
