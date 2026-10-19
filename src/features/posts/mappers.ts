import { mapProfileSummary, PROFILE_SUMMARY_SELECT, type ProfileSummaryRow } from '@/features/profile/mappers';
import { signPostImagePaths } from '@/lib/supabase/storage';
import type { CategoryRef, Post, PostStatus, Temperature, Visibility } from '@/types/models';

const CATEGORY_FIELDS = 'id, slug, name';

/** One select string for every post-shaped query, so all lists share a mapper. */
export const POST_SELECT = `
  id, title, rating, review, visibility, status, made_on, would_make_again, recipe_url,
  ingredients, prep_notes, next_time_notes, cook_time_minutes, temperature, milk, sweetener,
  like_count, comment_count, published_at, created_at, updated_at,
  author:profiles!posts_author_id_fkey(${PROFILE_SUMMARY_SELECT}),
  primary:categories!posts_primary_category_id_fkey(${CATEGORY_FIELDS}),
  subcategory:categories!posts_subcategory_id_fkey(${CATEGORY_FIELDS}),
  cuisine:categories!posts_cuisine_id_fkey(${CATEGORY_FIELDS}),
  meal_type:categories!posts_meal_type_id_fkey(${CATEGORY_FIELDS}),
  dish_type:categories!posts_dish_type_id_fkey(${CATEGORY_FIELDS}),
  images:post_images(id, storage_path, thumb_path, width, height, position),
  post_tags(tag:tags(id, slug, name)),
  viewer_has_liked,
  viewer_has_saved
`;

export interface PostRow {
  id: string;
  title: string;
  rating: number | null;
  review: string;
  visibility: Visibility;
  status: PostStatus;
  made_on: string;
  would_make_again: boolean | null;
  recipe_url: string | null;
  ingredients: string;
  prep_notes: string;
  next_time_notes: string;
  cook_time_minutes: number | null;
  temperature: Temperature | null;
  milk: string | null;
  sweetener: string | null;
  like_count: number;
  comment_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author: ProfileSummaryRow | null;
  primary: CategoryRef | null;
  subcategory: CategoryRef | null;
  cuisine: CategoryRef | null;
  meal_type: CategoryRef | null;
  dish_type: CategoryRef | null;
  images: { id: string; storage_path: string; thumb_path: string; width: number; height: number; position: number }[];
  post_tags: { tag: { id: string; slug: string; name: string } | null }[];
  viewer_has_liked: boolean;
  viewer_has_saved: boolean;
}

/** Maps a row to a Post. Returns null for rows whose author isn't visible. */
export function mapPost(row: PostRow): Post | null {
  if (!row.author || !row.primary) return null;
  return {
    id: row.id,
    author: mapProfileSummary(row.author),
    title: row.title,
    primary: row.primary,
    subcategory: row.subcategory,
    cuisine: row.cuisine,
    mealType: row.meal_type,
    dishType: row.dish_type,
    rating: row.rating === null ? null : Number(row.rating),
    review: row.review,
    visibility: row.visibility,
    status: row.status,
    madeOn: row.made_on,
    wouldMakeAgain: row.would_make_again,
    recipeUrl: row.recipe_url,
    ingredients: row.ingredients,
    prepNotes: row.prep_notes,
    nextTimeNotes: row.next_time_notes,
    cookTimeMinutes: row.cook_time_minutes,
    temperature: row.temperature,
    milk: row.milk,
    sweetener: row.sweetener,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: [...(row.images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((image) => ({
        id: image.id,
        storagePath: image.storage_path,
        thumbPath: image.thumb_path,
        width: image.width,
        height: image.height,
        url: null,
        thumbUrl: null,
      })),
    tags: (row.post_tags ?? [])
      .map((pt) => pt.tag)
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    viewerHasLiked: row.viewer_has_liked,
    viewerHasSaved: row.viewer_has_saved,
  };
}

export function mapPosts(rows: PostRow[]): Post[] {
  return rows.map(mapPost).filter((p): p is Post => p !== null);
}

/**
 * Signs image URLs for a batch of posts in one request.
 * 'full' — every full-size image (carousels) plus the cover thumbnail.
 * 'thumb' — only the cover thumbnail (grids).
 */
export async function attachImageUrls(posts: Post[], mode: 'full' | 'thumb'): Promise<Post[]> {
  const paths: string[] = [];
  for (const post of posts) {
    const cover = post.images[0];
    if (cover) paths.push(cover.thumbPath);
    if (mode === 'full') for (const image of post.images) paths.push(image.storagePath);
  }
  if (paths.length === 0) return posts;
  const urls = await signPostImagePaths(paths);
  return posts.map((post) => ({
    ...post,
    images: post.images.map((image, index) => ({
      ...image,
      url: mode === 'full' ? (urls[image.storagePath] ?? null) : null,
      thumbUrl: index === 0 || mode === 'full' ? (urls[image.thumbPath] ?? null) : null,
    })),
  }));
}
