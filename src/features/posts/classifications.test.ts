import { categoryLineParts } from '@/components/shared/CategoryLine';

import { toggleId } from './components/OptionChips';
import { groupClassifications } from './mappers';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const ref = (name: string) => ({ id: name.toLowerCase(), slug: name.toLowerCase(), name });

describe('toggleId', () => {
  it('adds in pick order and removes on second tap', () => {
    expect(toggleId([], 'korean')).toEqual(['korean']);
    expect(toggleId(['korean'], 'italian')).toEqual(['korean', 'italian']);
    expect(toggleId(['korean', 'italian'], 'korean')).toEqual(['italian']);
  });
});

describe('groupClassifications', () => {
  it('splits by kind and keeps the picked order', () => {
    const groups = groupClassifications([
      { position: 1, category: { ...ref('Italian'), kind: 'cuisine' } },
      { position: 0, category: { ...ref('Korean'), kind: 'cuisine' } },
      { position: 2, category: { ...ref('Noodles'), kind: 'dish_type' } },
      { position: 3, category: null },
    ]);
    expect(groups.cuisines.map((c) => c.name)).toEqual(['Korean', 'Italian']);
    expect(groups.dishTypes.map((c) => c.name)).toEqual(['Noodles']);
    expect(groups.subcategories).toEqual([]);
  });

  it('handles posts without classifications', () => {
    expect(groupClassifications(undefined)).toEqual({ subcategories: [], cuisines: [], dishTypes: [] });
  });
});

describe('categoryLineParts', () => {
  const post = {
    primary: ref('Drinks'),
    subcategories: [ref('Matcha'), ref('Lattes')],
    cuisines: [],
    dishTypes: [],
    temperature: 'iced' as const,
  };

  it('lists every classification', () => {
    expect(categoryLineParts(post)).toEqual(['Drinks', 'Matcha', 'Lattes', 'Iced']);
  });

  it('falls back to cuisines and collapses long lists', () => {
    expect(
      categoryLineParts({
        ...post,
        subcategories: [],
        cuisines: [ref('Korean'), ref('Italian'), ref('Japanese'), ref('French')],
        temperature: null,
      }),
    ).toEqual(['Drinks', 'Korean', 'Italian', '+2']);
  });
});
