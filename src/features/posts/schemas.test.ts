import type { Category } from '@/types/models';

import { buildTaxonomy } from '../taxonomy/taxonomy';
import { emptyPostForm, normalizeTags, postFormSchema, publishSchema, toSavePayload } from './schemas';

const cat = (id: string, kind: Category['kind'], slug: string, parentId: string | null = null): Category => ({
  id,
  kind,
  slug,
  name: slug,
  parentId,
  sortOrder: 0,
});

const taxonomy = buildTaxonomy([
  cat('drinks', 'primary', 'drinks'),
  cat('baking', 'primary', 'baking'),
  cat('cooking', 'primary', 'cooking'),
  cat('matcha', 'subcategory', 'matcha', 'drinks'),
  cat('cookies', 'subcategory', 'cookies', 'baking'),
  cat('rice', 'dish_type', 'rice'),
]);

const base = () => ({ ...emptyPostForm(), title: 'Iced Strawberry Matcha', primaryCategoryId: 'drinks' });

describe('post form validation', () => {
  it('requires a name and category', () => {
    const result = postFormSchema.safeParse({ ...emptyPostForm(), title: '   ' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['title', 'primaryCategoryId']));
  });

  it('allows drafts without a rating but requires one to publish', () => {
    expect(postFormSchema.safeParse(base()).success).toBe(true);
    const publish = publishSchema.safeParse(base());
    expect(publish.success).toBe(false);
    expect(publish.error?.issues[0]?.path).toEqual(['rating']);
    expect(publishSchema.safeParse({ ...base(), rating: 9.2 }).success).toBe(true);
  });

  it.each([-0.1, 10.1])('rejects out-of-range rating %d', (rating) => {
    expect(postFormSchema.safeParse({ ...base(), rating }).success).toBe(false);
  });

  it('validates recipe links', () => {
    expect(postFormSchema.safeParse({ ...base(), recipeUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(postFormSchema.safeParse({ ...base(), recipeUrl: 'https://cooking.example/x' }).success).toBe(true);
    expect(postFormSchema.safeParse({ ...base(), recipeUrl: '' }).success).toBe(true);
  });

  it('caps tags and photos', () => {
    expect(postFormSchema.safeParse({ ...base(), tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success).toBe(
      false,
    );
  });
});

describe('normalizeTags', () => {
  it('slugifies, dedupes and drops empties', () => {
    expect(normalizeTags(['Oat Milk', 'oat-milk', ' ', 'Iced!', 'iced'])).toEqual(['oat milk', 'iced']);
  });
});

describe('toSavePayload', () => {
  it('trims the story and keeps paragraph breaks', () => {
    const { p_post } = toSavePayload(
      { ...base(), rating: 8, story: '  Day one.\n\nDay two.  ' },
      'post-3',
      'published',
      taxonomy,
    );
    expect(p_post.story).toBe('Day one.\n\nDay two.');
  });

  it('keeps drink fields for drinks', () => {
    const { p_post, p_tags } = toSavePayload(
      { ...base(), rating: 9.2, subcategoryId: 'matcha', temperature: 'iced', milk: ' Oat ', tags: ['Iced'] },
      'post-1',
      'published',
      taxonomy,
    );
    expect(p_post).toMatchObject({
      id: 'post-1',
      status: 'published',
      subcategory_id: 'matcha',
      temperature: 'iced',
      milk: 'Oat',
      cook_time_minutes: null,
    });
    expect(p_tags).toEqual(['iced']);
  });

  it('clears fields that no longer apply after switching category', () => {
    const { p_post } = toSavePayload(
      {
        ...base(),
        primaryCategoryId: 'baking',
        subcategoryId: 'matcha',
        dishTypeId: 'rice',
        temperature: 'iced',
        milk: 'oat',
        cookTimeMinutes: 25,
        recipeUrl: '  ',
      },
      'post-2',
      'draft',
      taxonomy,
    );
    expect(p_post).toMatchObject({
      subcategory_id: null,
      dish_type_id: null,
      temperature: null,
      milk: null,
      cook_time_minutes: 25,
      recipe_url: null,
      status: 'draft',
    });
  });
});
