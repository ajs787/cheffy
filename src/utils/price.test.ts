import { budgetLabel, formatDollars, parseDollars } from './price';

describe('Budget Eats prices', () => {
  it('parses dollars into cents', () => {
    expect(parseDollars('3.2')).toBe(320);
    expect(parseDollars('$3.20')).toBe(320);
    expect(parseDollars(' 12 ')).toBe(1200);
    expect(parseDollars('0.99')).toBe(99);
    expect(parseDollars('')).toBeNull();
  });
  it('rejects anything that is not a plain amount', () => {
    for (const bad of ['abc', '3.333', '-2', '1e3', '12345', '3,20']) expect(parseDollars(bad)).toBeNaN();
  });
  it('formats estimates', () => {
    expect(formatDollars(320)).toBe('$3.20');
    expect(budgetLabel(320)).toBe('Budget Eats · ~$3.20 / serving');
    expect(budgetLabel(null)).toBe('Budget Eats');
  });
});
