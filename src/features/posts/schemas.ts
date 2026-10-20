import { z } from 'zod';

import type { Post, Taxonomy, Visibility } from '@/types/models';
import { toLocalISODate } from '@/utils/dates';
import { slugifyTag } from '@/utils/format';

export const MAX_IMAGES = 6;
export const MAX_TAGS = 10;

/** A photo in the compose form: either picked on device or already uploaded. */
export type ComposeImage =
  | { key: string; kind: 'local'; uri: string; width: number; height: number }
  | {
      key: string;
      kind: 'remote';
      id: string;
      storagePath: string;
      thumbPath: string;
      width: number;
      height: number;
      uri: string | null;
    };

const optionalText = (max: number, label: string) => z.string().max(max, `${label} is too long (max ${max}).`);

const nullableId = z.string().nullable();

export const postFormSchema = z.object({
  title: z.string().trim().min(1, 'Name what you made.').max(80, 'Keep the name under 80 characters.'),
  primaryCategoryId: z.string({ error: 'Choose a category.' }).min(1, 'Choose a category.'),
  subcategoryId: nullableId,
  cuisineId: nullableId,
  mealTypeId: nullableId,
  dishTypeId: nullableId,
  rating: z.number().min(0).max(10).nullable(),
  review: optionalText(2000, 'Review'),
  story: optionalText(10000, 'Story'),
  tags: z.array(z.string()).max(MAX_TAGS, `Up to ${MAX_TAGS} tags.`),
  visibility: z.enum(['public', 'followers', 'private']),
  madeOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wouldMakeAgain: z.boolean().nullable(),
  recipeUrl: z
    .string()
    .trim()
    .max(500, 'That link is too long.')
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Links need to start with http:// or https://'),
  ingredients: optionalText(2000, 'Ingredients'),
  prepNotes: optionalText(2000, 'Notes'),
  nextTimeNotes: optionalText(1000, 'Notes for next time'),
  cookTimeMinutes: z.number().int().min(1, 'At least 1 minute.').max(2880, 'Max 48 hours.').nullable(),
  temperature: z.enum(['hot', 'iced']).nullable(),
  milk: optionalText(40, 'Milk'),
  sweetener: optionalText(40, 'Sweetener'),
  images: z.array(z.custom<ComposeImage>()).max(MAX_IMAGES, `Up to ${MAX_IMAGES} photos.`),
});

export type PostFormValues = z.infer<typeof postFormSchema>;

/** Publishing additionally requires a rating; drafts don't. */
export const publishSchema = postFormSchema.refine((v) => v.rating !== null, {
  path: ['rating'],
  message: 'Give it a rating.',
});

export function emptyPostForm(defaults?: { visibility?: Visibility; primaryCategoryId?: string }): PostFormValues {
  return {
    title: '',
    primaryCategoryId: defaults?.primaryCategoryId ?? '',
    subcategoryId: null,
    cuisineId: null,
    mealTypeId: null,
    dishTypeId: null,
    rating: null,
    review: '',
    story: '',
    tags: [],
    visibility: defaults?.visibility ?? 'public',
    madeOn: toLocalISODate(new Date()),
    wouldMakeAgain: null,
    recipeUrl: '',
    ingredients: '',
    prepNotes: '',
    nextTimeNotes: '',
    cookTimeMinutes: null,
    temperature: null,
    milk: '',
    sweetener: '',
    images: [],
  };
}

export function postToForm(post: Post): PostFormValues {
  return {
    title: post.title,
    primaryCategoryId: post.primary.id,
    subcategoryId: post.subcategory?.id ?? null,
    cuisineId: post.cuisine?.id ?? null,
    mealTypeId: post.mealType?.id ?? null,
    dishTypeId: post.dishType?.id ?? null,
    rating: post.rating,
    review: post.review,
    story: post.story,
    tags: post.tags.map((t) => t.name),
    visibility: post.visibility,
    madeOn: post.madeOn,
    wouldMakeAgain: post.wouldMakeAgain,
    recipeUrl: post.recipeUrl ?? '',
    ingredients: post.ingredients,
    prepNotes: post.prepNotes,
    nextTimeNotes: post.nextTimeNotes,
    cookTimeMinutes: post.cookTimeMinutes,
    temperature: post.temperature,
    milk: post.milk ?? '',
    sweetener: post.sweetener ?? '',
    images: post.images.map((image) => ({
      key: image.id,
      kind: 'remote',
      id: image.id,
      storagePath: image.storagePath,
      thumbPath: image.thumbPath,
      width: image.width,
      height: image.height,
      uri: image.url,
    })),
  };
}

/** Normalizes and de-duplicates tags the way the database will. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const slug = slugifyTag(tag);
    if (slug.length === 0 || slug.length > 30 || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug.replace(/-/g, ' '));
  }
  return result;
}

export interface SavePostPayload {
  p_post: Record<string, unknown>;
  p_tags: string[];
}

/**
 * Builds the `save_post` RPC payload. Fields that don't apply to the chosen
 * category are cleared, so switching Drinks → Baking doesn't leave a stale
 * "iced" behind.
 */
export function toSavePayload(
  values: PostFormValues,
  postId: string,
  status: 'draft' | 'published',
  taxonomy: Taxonomy,
): SavePostPayload {
  const primary = taxonomy.byId[values.primaryCategoryId];
  const isDrink = primary?.slug === 'drinks';
  const subcategory = values.subcategoryId ? taxonomy.byId[values.subcategoryId] : undefined;
  const validSubcategory = subcategory?.parentId === values.primaryCategoryId ? subcategory.id : null;
  const trimmed = (v: string) => v.trim();

  return {
    p_post: {
      id: postId,
      title: values.title.trim(),
      primary_category_id: values.primaryCategoryId,
      subcategory_id: validSubcategory,
      cuisine_id: values.cuisineId,
      meal_type_id: values.mealTypeId,
      dish_type_id: primary?.slug === 'cooking' ? values.dishTypeId : null,
      rating: values.rating,
      review: trimmed(values.review),
      story: trimmed(values.story),
      visibility: values.visibility,
      status,
      made_on: values.madeOn,
      would_make_again: values.wouldMakeAgain,
      recipe_url: trimmed(values.recipeUrl) || null,
      ingredients: trimmed(values.ingredients),
      prep_notes: trimmed(values.prepNotes),
      next_time_notes: isDrink ? '' : trimmed(values.nextTimeNotes),
      cook_time_minutes: isDrink ? null : values.cookTimeMinutes,
      temperature: isDrink ? values.temperature : null,
      milk: isDrink ? trimmed(values.milk) || null : null,
      sweetener: isDrink ? trimmed(values.sweetener) || null : null,
    },
    p_tags: normalizeTags(values.tags),
  };
}
