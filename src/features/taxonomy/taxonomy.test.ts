import type { Category } from '@/types/models';

import {
  buildTaxonomy,
  canAddCustom,
  commonFirst,
  detailFieldsFor,
  normalizeLabel,
  quickPickFor,
  searchOptions,
} from './taxonomy';

const c = (over: Partial<Category> & Pick<Category, 'id' | 'kind' | 'slug'>): Category => ({
  parentId: null,
  name: over.slug,
  sortOrder: 0,
  isCustom: false,
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

describe('picker helpers', () => {
  const opts: Category[] = [
    c({ id: 'tr', kind: 'cuisine', slug: 'turkish', name: 'Turkish', sortOrder: 50 }),
    c({ id: 'it', kind: 'cuisine', slug: 'italian', name: 'Italian', sortOrder: 4 }),
    c({ id: 'kr', kind: 'cuisine', slug: 'korean', name: 'Korean', sortOrder: 1 }),
    c({ id: 'ot', kind: 'cuisine', slug: 'other', name: 'Other', sortOrder: 99 }),
    c({ id: 'uy', kind: 'cuisine', slug: 'uyghur', name: 'Uyghur', sortOrder: 500, isCustom: true }),
  ];

  it('puts the most used first, then the curated order, without Other', () => {
    expect(commonFirst(opts, { tr: 5, it: 2 }, 3).map((o) => o.id)).toEqual(['tr', 'it', 'kr']);
  });

  it('searches names and custom labels, prefix matches first', () => {
    expect(searchOptions(opts, 'tur').map((o) => o.id)).toEqual(['tr']);
    expect(searchOptions(opts, 'an').map((o) => o.id)).toEqual(['it', 'kr']);
    expect(searchOptions(opts, 'uyg').map((o) => o.id)).toEqual(['uy']);
    expect(searchOptions(opts, '').map((o) => o.name)).toEqual(['Italian', 'Korean', 'Turkish', 'Uyghur']);
  });

  it('only offers to add a genuinely new label', () => {
    expect(normalizeLabel('  Café   Créole ')).toBe('cafe-creole');
    expect(canAddCustom(opts, 'TURKISH ')).toBe(false);
    expect(canAddCustom(opts, 'Georgian fusion')).toBe(true);
    expect(canAddCustom(opts, 'x')).toBe(false);
    expect(canAddCustom(opts, 'other')).toBe(false);
  });

  it('keeps custom labels out of default lists', () => {
    const t = buildTaxonomy([...opts]);
    expect(t.cuisines.map((o) => o.id)).not.toContain('uy');
    expect(t.custom.map((o) => o.id)).toEqual(['uy']);
    expect(t.byId.uy?.name).toBe('Uyghur');
  });
});
