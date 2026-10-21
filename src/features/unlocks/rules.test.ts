import { newlyUnlocked, recapView, UNLOCKS } from './rules';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const state = { unlocked: [] as never[], creations: 2, referrals: 1, collaborations: 0 };

describe('unlock progress', () => {
  it('shows honest progress until unlocked', () => {
    const [theme, frame, together, recap] = UNLOCKS;
    expect(theme!.progress(state)).toBe('2 of 3 creations');
    expect(frame!.progress(state)).toBe('1 of 2 friends joined with your code');
    expect(together!.progress(state)).toBe('Co-post a creation with a friend');
    expect(recap!.progress({ ...state, creations: 14 })).toBe('10 of 10 creations');
    expect(theme!.progress({ ...state, unlocked: ['theme_saffron'] as never[] })).toBeNull();
  });

  it('only announces unlocks once', () => {
    expect(newlyUnlocked(['theme_saffron', 'recap'], ['theme_saffron'])).toEqual(['recap']);
    expect(newlyUnlocked(['theme_saffron'], ['theme_saffron'])).toEqual([]);
  });
});

describe('recapView', () => {
  const base = {
    total: 10,
    average: 8.2,
    firstMadeOn: '2026-09-01',
    byPrimary: [
      { slug: 'drinks', name: 'Drinks', count: 7 },
      { slug: 'baking', name: 'Baking', count: 3 },
    ],
    top: { postId: 'p', title: 'Matcha', rating: 9.5 },
    cuisines: [{ name: 'Korean', count: 4 }],
    cuisineTagged: 4,
  };

  it('summarizes real data', () => {
    const v = recapView(base);
    expect(v.mostMade).toEqual({ name: 'Drinks', share: 0.7 });
    expect(v.distribution.map((d) => d.share)).toEqual([0.7, 0.3]);
    expect(v.cuisines).toEqual([{ name: 'Korean', count: 4 }]);
  });

  it('leaves out what the data can’t support', () => {
    const tied = recapView({
      ...base,
      byPrimary: [
        { slug: 'drinks', name: 'Drinks', count: 5 },
        { slug: 'baking', name: 'Baking', count: 5 },
      ],
      cuisineTagged: 2,
    });
    expect(tied.mostMade).toBeNull();
    expect(tied.cuisines).toBeNull();
  });
});
