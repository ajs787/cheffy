import {
  mapProfileSummary,
  PROFILE_SUMMARY_SELECT,
  type ProfileSummaryRow,
} from '@/features/profile/mappers';
import { signPostImagePaths } from '@/lib/supabase/storage';
import type {
  CategoryKind,
  CategoryRef,
  Post,
  PostImage,
  PostStatus,
  Temperature,
  Visibility,
} from '@/types/models';

const CATEGORY_FIELDS = 'id, slug, name';

/** One select string for every post-shaped query, so all lists share a mapper. */
export const POST_SELECT = `
  id, title, rating, review, story, visibility, status, made_on, would_make_again, recipe_url,
  ingredients, prep_notes, next_time_notes, cook_time_minutes, temperature, milk, sweetener,
  like_count, comment_count, published_at, created_at, updated_at,
  author:profiles!posts_author_id_fkey(${PROFILE_SUMMARY_SELECT}),
  primary:categories!posts_primary_category_id_fkey(${CATEGORY_FIELDS}),
  meal_type:categories!posts_meal_type_id_fkey(${CATEGORY_FIELDS}),
  classifications:post_categories(position, category:categories(${CATEGORY_FIELDS}, kind)),
  images:post_images(id, storage_path, thumb_path, width, height, position),
  post_tags(tag:tags(id, slug, name)),
  viewer_has_liked,
  viewer_has_saved
`;

/**
 * Feed queries add the most recent likers for "Liked by …". Callers must
 * order and limit the `likers` embed (see `withRecentLikers`).
 */
export const FEED_POST_SELECT = `${POST_SELECT},
  likers:likes(created_at, profile:profiles!likes_user_id_fkey(${PROFILE_SUMMARY_SELECT}))
`;

type OrderLimitBuilder<T> = {
  order: (column: string, options: { ascending: boolean; referencedTable: string }) => T;
};

/** Newest three likers per post. */
export function withRecentLikers<
  T extends OrderLimitBuilder<T> & { limit: (n: number, o: { referencedTable: string }) => T },
>(query: T): T {
  return query
    .order('created_at', { ascending: false, referencedTable: 'likers' })
    .limit(3, { referencedTable: 'likers' });
}

export interface PostRow {
  id: string;
  title: string;
  rating: number | null;
  review: string;
  story: string;
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
  meal_type: CategoryRef | null;
  classifications?: { position: number; category: (CategoryRef & { kind: CategoryKind }) | null }[];
  images: {
    id: string;
    storage_path: string;
    thumb_path: string;
    width: number;
    height: number;
    position: number;
  }[];
  post_tags: { tag: { id: string; slug: string; name: string } | null }[];
  viewer_has_liked: boolean;
  viewer_has_saved: boolean;
  likers?: { created_at: string; profile: ProfileSummaryRow | null }[];
}

/** Splits a post's ordered classifications by kind. */
export function groupClassifications(
  rows: PostRow['classifications'],
): Pick<Post, 'subcategories' | 'cuisines' | 'dishTypes'> {
  const groups: Pick<Post, 'subcategories' | 'cuisines' | 'dishTypes'> = {
    subcategories: [],
    cuisines: [],
    dishTypes: [],
  };
  const key = { subcategory: 'subcategories', cuisine: 'cuisines', dish_type: 'dishTypes' } as const;
  for (const { category } of [...(rows ?? [])].sort((a, b) => a.position - b.position)) {
    if (!category) continue;
    const group = key[category.kind as keyof typeof key];
    if (group) groups[group].push({ id: category.id, slug: category.slug, name: category.name });
  }
  return groups;
}

/** Maps a row to a Post. Returns null for rows whose author isn't visible. */
export function mapPost(row: PostRow): Post | null {
  if (!row.author || !row.primary) return null;
  return {
    id: row.id,
    author: mapProfileSummary(row.author),
    title: row.title,
    primary: row.primary,
    ...groupClassifications(row.classifications),
    mealType: row.meal_type,
    rating: row.rating === null ? null : Number(row.rating),
    review: row.review,
    story: row.story ?? '',
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
    recentLikers: (row.likers ?? []).flatMap((l) => (l.profile ? [mapProfileSummary(l.profile)] : [])),
  };
}

export function mapPosts(rows: PostRow[]): Post[] {
  return rows.map(mapPost).filter((p): p is Post => p !== null);
}

export type ImageSigningMode = 'full' | 'card' | 'thumb';

/** Which files a screen needs for image `index` of a post. */
function wantedPaths(
  image: PostImage,
  index: number,
  mode: ImageSigningMode,
): { full: boolean; thumb: boolean } {
  switch (mode) {
    case 'full': // post detail carousel: every full image, cover thumb as placeholder
      return { full: true, thumb: index === 0 };
    case 'card': // feed card: a large cover, small thumbs for the rest of the mosaic
      return { full: index === 0, thumb: true };
    default: // grids: the cover thumbnail only
      return { full: false, thumb: index === 0 };
  }
}

/** Signs exactly the image files a screen will show, for a batch of posts, in one request. */
export async function attachImageUrls(posts: Post[], mode: ImageSigningMode): Promise<Post[]> {
  const paths: string[] = [];
  for (const post of posts) {
    post.images.forEach((image, index) => {
      const want = wantedPaths(image, index, mode);
      if (want.full) paths.push(image.storagePath);
      if (want.thumb) paths.push(image.thumbPath);
    });
  }
  if (paths.length === 0) return posts;
  const urls = await signPostImagePaths(paths);
  return posts.map((post) => ({
    ...post,
    images: post.images.map((image, index) => {
      const want = wantedPaths(image, index, mode);
      return {
        ...image,
        url: want.full ? (urls[image.storagePath] ?? null) : null,
        thumbUrl: want.thumb ? (urls[image.thumbPath] ?? null) : null,
      };
    }),
  }));
}
