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

const optionalText = (max: number, label: string) =>
  z.string().max(max, `${label} is too long (max ${max}).`);

const nullableId = z.string().nullable();

export const MAX_CLASSIFICATIONS = 12;
const ids = z.array(z.string());

export type CustomKind = 'cuisine' | 'subcategory' | 'dish_type';
const customLabel = z.object({
  kind: z.enum(['cuisine', 'subcategory', 'dish_type']),
  label: z.string().trim().min(2).max(30),
});
export type CustomLabel = z.infer<typeof customLabel>;

export const postFormSchema = z.object({
  title: z.string().trim().min(1, 'Name what you made.').max(80, 'Keep the name under 80 characters.'),
  primaryCategoryId: z.string({ error: 'Choose a category.' }).min(1, 'Choose a category.'),
  subcategoryIds: ids,
  cuisineIds: ids,
  mealTypeId: nullableId,
  dishTypeIds: ids,
  /** New labels typed under "Other / Add custom" (created on save). */
  customLabels: z.array(customLabel).max(6, 'Up to 6 custom labels.'),
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
  // No longer editable (removed from the form in V7). Older posts keep their
  // values: they load into the form untouched and save back unchanged.
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

export function emptyPostForm(defaults?: {
  visibility?: Visibility;
  primaryCategoryId?: string;
}): PostFormValues {
  return {
    title: '',
    primaryCategoryId: defaults?.primaryCategoryId ?? '',
    subcategoryIds: [],
    cuisineIds: [],
    mealTypeId: null,
    dishTypeIds: [],
    customLabels: [],
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
    subcategoryIds: post.subcategories.map((c) => c.id),
    cuisineIds: post.cuisines.map((c) => c.id),
    mealTypeId: post.mealType?.id ?? null,
    dishTypeIds: post.dishTypes.map((c) => c.id),
    customLabels: [],
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
  /** Subcategories, then cuisines, then dish types, each in picked order. */
  p_categories: string[];
  /** New labels for the database to find or create. */
  p_custom: CustomLabel[];
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
  // Subcategories of a different primary (after switching) are dropped.
  const subcategories = values.subcategoryIds.filter(
    (id) => taxonomy.byId[id]?.parentId === values.primaryCategoryId,
  );
  const dishTypes = primary?.slug === 'cooking' ? values.dishTypeIds : [];
  const categories = [...new Set([...subcategories, ...values.cuisineIds, ...dishTypes])].slice(
    0,
    MAX_CLASSIFICATIONS,
  );
  const trimmed = (v: string) => v.trim();

  return {
    p_post: {
      id: postId,
      title: values.title.trim(),
      primary_category_id: values.primaryCategoryId,
      meal_type_id: values.mealTypeId,
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
    p_categories: categories,
    p_custom: values.customLabels.filter(
      (c) => c.kind === 'cuisine' || (c.kind === 'dish_type' ? primary?.slug === 'cooking' : true),
    ),
  };
}
