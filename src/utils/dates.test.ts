import { formatCalendarDate, formatRelativeTime, parseLocalDate, toLocalISODate } from './dates';

const now = new Date(2026, 9, 18, 12, 0, 0);

describe('dates', () => {
  it('round-trips local ISO dates without timezone shifts', () => {
    expect(toLocalISODate(parseLocalDate('2026-01-31'))).toBe('2026-01-31');
  });

  it('formats calendar dates, adding the year only when needed', () => {
    expect(formatCalendarDate('2026-03-04', now)).toBe('Mar 4');
    expect(formatCalendarDate('2025-12-25', now)).toBe('Dec 25, 2025');
  });

  it('formats relative time', () => {
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    expect(formatRelativeTime(ago(10_000), now)).toBe('now');
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5m');
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe('3h');
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe('2d');
    expect(formatRelativeTime(ago(30 * 86_400_000), now)).toBe('Sep 18');
  });
});
