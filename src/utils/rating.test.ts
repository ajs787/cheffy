import { formatRating, parseRatingInput, ratingTier, roundRating, stepRating } from './rating';

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

  it('assigns tiers', () => {
    expect(ratingTier(9.4)).toBe('great');
    expect(ratingTier(8)).toBe('great');
    expect(ratingTier(7.9)).toBe('good');
    expect(ratingTier(5.9)).toBe('low');
  });
});
