import { formatCookTime, formatCount, initials, paragraphs, pluralize, readingMinutes, slugifyTag } from './format';

describe('format', () => {
  it('formats counts compactly', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1200)).toBe('1.2k');
    expect(formatCount(1000)).toBe('1k');
    expect(formatCount(45_300)).toBe('45k');
    expect(formatCount(2_500_000)).toBe('2.5m');
  });

  it('pluralizes', () => {
    expect(pluralize(1, 'like')).toBe('1 like');
    expect(pluralize(2, 'like')).toBe('2 likes');
  });

  it('formats cook time', () => {
    expect(formatCookTime(45)).toBe('45 min');
    expect(formatCookTime(60)).toBe('1 hr');
    expect(formatCookTime(95)).toBe('1 hr 35 min');
  });

  it('builds initials', () => {
    expect(initials('Audrey Shin')).toBe('AS');
    expect(initials('chef')).toBe('C');
    expect(initials('  ')).toBe('?');
  });

  it('slugifies tags like the database', () => {
    expect(slugifyTag(' Oat Milk ')).toBe('oat-milk');
    expect(slugifyTag('Brown-Butter!!')).toBe('brown-butter');
  });

  it('estimates reading time', () => {
    expect(readingMinutes('short')).toBe(1);
    expect(readingMinutes(Array.from({ length: 600 }, () => 'word').join(' '))).toBe(3);
  });

  it('splits paragraphs on blank lines', () => {
    expect(paragraphs('One.\n\n  Two\nstill two.\n\n\nThree.')).toEqual(['One.', 'Two\nstill two.', 'Three.']);
  });
});
