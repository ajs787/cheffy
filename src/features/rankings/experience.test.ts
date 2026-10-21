import { celebrationFor, preferenceConflicts, type Placement } from './experience';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const placement = (over: Partial<Placement>): Placement => ({
  rank: 1,
  total: 5,
  primarySlug: 'drinks',
  primaryName: 'Drinks',
  passedPostId: 'p',
  passedTitle: 'Pistachio Latte',
  ...over,
});

describe('celebrationFor', () => {
  it('celebrates a new #1 and names what it passed', () => {
    expect(celebrationFor(placement({}), 'Strawberry Matcha')).toEqual({
      kind: 'first',
      headline: 'Your new #1 drink!',
      detail: 'Strawberry Matcha just passed Pistachio Latte.',
    });
  });

  it('gives a smaller note for the top five, without inventing what it passed', () => {
    expect(
      celebrationFor(placement({ rank: 3, total: 12, primarySlug: 'baking', passedTitle: null }), 'Focaccia'),
    ).toEqual({
      kind: 'top5',
      headline: '#3 of your 12 bakes',
      detail: null,
    });
  });

  it('stays quiet without enough history or outside the top five', () => {
    expect(celebrationFor(placement({ total: 1 }), 'First')).toBeNull();
    expect(celebrationFor(placement({ total: 2 }), 'Second')).toBeNull();
    expect(celebrationFor(placement({ rank: 6, total: 9 }), 'Sixth')).toBeNull();
    expect(celebrationFor(null, 'x')).toBeNull();
  });
});

describe('preferenceConflicts', () => {
  it('flags preferring the lower-rated creation', () => {
    expect(preferenceConflicts(7.5, 8)).toBe(true);
    expect(preferenceConflicts(8, 8)).toBe(false);
    expect(preferenceConflicts(9, 8)).toBe(false);
  });
});
