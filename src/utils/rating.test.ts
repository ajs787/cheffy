import {
  formatRating,
  parseRatingInput,
  ratingFill,
  contrastRatio,
  RATING_COLOR_STOPS,
  RATING_COLOR_VALUES,
  ratingColor,
  ratingTextColor,
  UNRATED_COLOR,
  roundRating,
  stepRating,
} from './rating';

describe('rating utils', () => {
  it('rounds and clamps to one decimal', () => {
    expect(roundRating(8.25)).toBe(8.3);
    expect(roundRating(0.1 + 0.2)).toBe(0.3);
    expect(roundRating(11)).toBe(10);
    expect(roundRating(-2)).toBe(0);
    expect(roundRating(Number.NaN)).toBe(0);
  });

  it('steps without float drift', () => {
    let value = 0;
    for (let i = 0; i < 92; i++) value = stepRating(value, 1);
    expect(value).toBe(9.2);
    expect(stepRating(10, 1)).toBe(10);
    expect(stepRating(0, -1)).toBe(0);
  });

  it('formats', () => {
    expect(formatRating(10)).toBe('10.0');
    expect(formatRating(9.2)).toBe('9.2');
    expect(formatRating(null)).toBe('–');
  });

  it.each([
    ['9.2', 9.2],
    ['9,2', 9.2],
    ['.5', 0.5],
    ['10', 10],
    ['92', 9.2],
    ['100', 10],
    ['0', 0],
    ['7.45', 7.5],
  ])('parses %s as %d', (input, expected) => {
    expect(parseRatingInput(input)).toBe(expected);
  });

  it.each(['', '.', 'abc', '10.5', '101', '-1', '1.2.3'])('rejects %s', (input) => {
    expect(parseRatingInput(input)).toBeNull();
  });
});

describe('rating ring', () => {
  it('fills rating / 10, clamped, empty when unrated', () => {
    expect(ratingFill(6.5)).toBeCloseTo(0.65);
    expect(ratingFill(9.2)).toBeCloseTo(0.92);
    expect(ratingFill(10)).toBe(1);
    expect(ratingFill(0)).toBe(0);
    expect(ratingFill(12)).toBe(1);
    expect(ratingFill(null)).toBe(0);
  });

  it('runs from red at 0 to bright green at 10 through the anchors', () => {
    expect(ratingColor(0)).toBe('#e5484d');
    expect(ratingColor(5)).toBe('#e9c746');
    expect(ratingColor(6.5)).toBe('#a9c94d');
    expect(ratingColor(8)).toBe('#53b96b');
    expect(ratingColor(10)).toBe('#20c967');
    expect(ratingColor(null)).toBe(UNRATED_COLOR);
  });

  it('blends between anchors without leaving the segment', () => {
    for (const v of [2.5, 9.2]) expect(ratingColor(v)).toMatch(/^#[0-9a-f]{6}$/);
    // 9.2 sits between 8.0 and 10.0: greener than 8, not yet as bright as 10.
    const g = (hex: string) => parseInt(hex.slice(3, 5), 16);
    expect(g(ratingColor(9.2))).toBeGreaterThan(g(ratingColor(8)));
    expect(ratingColor(9.2)).not.toBe(ratingColor(10));
  });

  it('keeps rating numbers readable on ivory', () => {
    for (const v of [0, 2.5, 5, 6.5, 8, 9.2, 10]) {
      expect(contrastRatio(ratingTextColor(v), '#F7F1E8')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ratingTextColor(v, 3), '#F7F1E8')).toBeGreaterThanOrEqual(3);
    }
  });

  it('provides dense stops for animation', () => {
    expect(RATING_COLOR_STOPS[0]).toBe(0);
    expect(RATING_COLOR_STOPS.at(-1)).toBe(10);
    expect(RATING_COLOR_VALUES).toHaveLength(RATING_COLOR_STOPS.length);
  });
});
