import { compareRankingRows, summarizeRatings } from './api';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const rows = [
  { rank: 2, made_on: '2026-02-01', created_at: '2026-02-01T10:00:00Z' },
  { rank: 1, made_on: '2026-01-20', created_at: '2026-01-20T10:00:00Z' },
  { rank: 3, made_on: '2026-03-01', created_at: '2026-03-01T10:00:00Z' },
  { rank: 4, made_on: '2026-03-01', created_at: '2026-03-01T09:00:00Z' },
];

describe('compareRankingRows', () => {
  const order = (sort: Parameters<typeof compareRankingRows>[2]) =>
    [...rows].sort((a, b) => compareRankingRows(a, b, sort)).map((r) => r.rank);

  it('orders by rank for highest and lowest', () => {
    expect(order('highest')).toEqual([1, 2, 3, 4]);
    expect(order('lowest')).toEqual([4, 3, 2, 1]);
  });

  it('orders by date made, breaking ties by creation time', () => {
    expect(order('recent')).toEqual([3, 4, 2, 1]);
    expect(order('oldest')).toEqual([1, 2, 4, 3]);
  });
});

describe('summarizeRatings', () => {
  it('averages to one decimal and finds the most-made category', () => {
    expect(
      summarizeRatings([
        { rating: 9.2, primary_category_id: 'drinks' },
        { rating: 7.5, primary_category_id: 'baking' },
        { rating: 8.4, primary_category_id: 'drinks' },
      ]),
    ).toEqual({ count: 3, average: 8.4, topPrimaryId: 'drinks' });
  });

  it('is empty with no ratings', () => {
    expect(summarizeRatings([])).toEqual({ count: 0, average: null, topPrimaryId: null });
  });
});
