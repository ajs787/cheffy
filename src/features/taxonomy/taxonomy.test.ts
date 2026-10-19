import type { Category } from '@/types/models';

import { buildTaxonomy, detailFieldsFor, quickPickFor } from './taxonomy';

const c = (over: Partial<Category> & Pick<Category, 'id' | 'kind' | 'slug'>): Category => ({
  parentId: null,
  name: over.slug,
  sortOrder: 0,
  ...over,
});

const categories: Category[] = [
  c({ id: 'drinks', kind: 'primary', slug: 'drinks', name: 'Drinks', sortOrder: 3 }),
  c({ id: 'cooking', kind: 'primary', slug: 'cooking', name: 'Cooking', sortOrder: 1 }),
  c({ id: 'baking', kind: 'primary', slug: 'baking', name: 'Baking', sortOrder: 2 }),
  c({ id: 'matcha', kind: 'subcategory', slug: 'matcha', parentId: 'drinks', sortOrder: 1 }),
  c({ id: 'other-d', kind: 'subcategory', slug: 'other', parentId: 'drinks', sortOrder: 99 }),
  c({ id: 'coffee', kind: 'subcategory', slug: 'coffee', parentId: 'drinks', sortOrder: 2 }),
  c({ id: 'korean', kind: 'cuisine', slug: 'korean' }),
  c({ id: 'lunch', kind: 'meal_type', slug: 'lunch' }),
  c({ id: 'rice', kind: 'dish_type', slug: 'rice' }),
  c({ id: 'fermented', kind: 'primary', slug: 'fermented', name: 'Fermented', sortOrder: 4 }),
];

describe('taxonomy', () => {
  const taxonomy = buildTaxonomy(categories);

  it('groups and orders categories by kind', () => {
    expect(taxonomy.primaries.map((p) => p.slug)).toEqual(['cooking', 'baking', 'drinks', 'fermented']);
    expect(taxonomy.subcategoriesByPrimary.drinks?.map((s) => s.slug)).toEqual(['matcha', 'coffee', 'other']);
    expect(taxonomy.cuisines).toHaveLength(1);
    expect(taxonomy.mealTypes).toHaveLength(1);
    expect(taxonomy.dishTypes).toHaveLength(1);
    expect(taxonomy.byId.matcha?.slug).toBe('matcha');
  });

  it('uses subcategories as the quick pick when a primary has them', () => {
    const pick = quickPickFor(taxonomy, 'drinks');
    expect(pick.kind).toBe('subcategory');
    expect(pick.label).toBe('What kind?');
    expect(pick.options.map((o) => o.slug)).toEqual(['matcha', 'coffee', 'other']);
  });

  it('falls back to cuisine for primaries without subcategories, including new ones', () => {
    expect(quickPickFor(taxonomy, 'cooking').kind).toBe('cuisine');
    expect(quickPickFor(taxonomy, 'fermented').kind).toBe('cuisine');
    expect(quickPickFor(taxonomy, null).kind).toBe('cuisine');
  });

  it('chooses detail fields per category', () => {
    expect(detailFieldsFor('drinks')).toMatchObject({ drink: true, cookTime: false });
    expect(detailFieldsFor('baking')).toMatchObject({ drink: false, cookTime: true, dishType: false });
    expect(detailFieldsFor('cooking')).toMatchObject({ dishType: true });
  });
});
