/**
 * App-facing domain types (camelCase). Database rows are mapped into these at
 * the feature `api.ts` boundary, so screens never see snake_case.
 */

export type Visibility = 'public' | 'followers' | 'private';
export type PostStatus = 'draft' | 'published';
export type Temperature = 'hot' | 'iced';
export type CategoryKind = 'primary' | 'subcategory' | 'cuisine' | 'meal_type' | 'dish_type';

export interface ProfileSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Profile extends ProfileSummary {
  bio: string;
  avatarPath: string | null;
  createdAt: string;
}

export interface ProfileWithViewer extends Profile {
  viewerIsFollowing: boolean;
  viewerHasBlocked: boolean;
}

export interface ProfileStats {
  followers: number;
  following: number;
  posts: number;
  byPrimary: { slug: string; name: string; count: number }[];
}

export interface Category {
  id: string;
  kind: CategoryKind;
  parentId: string | null;
  slug: string;
  name: string;
  sortOrder: number;
}

export type CategoryRef = Pick<Category, 'id' | 'slug' | 'name'>;

export interface Taxonomy {
  all: Category[];
  byId: Record<string, Category>;
  primaries: Category[];
  subcategoriesByPrimary: Record<string, Category[]>;
  cuisines: Category[];
  mealTypes: Category[];
  dishTypes: Category[];
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
}

export interface PostImage {
  id: string;
  storagePath: string;
  thumbPath: string;
  width: number;
  height: number;
  /** Signed URLs, filled in after fetching. */
  url: string | null;
  thumbUrl: string | null;
}

export interface Post {
  id: string;
  author: ProfileSummary;
  title: string;
  primary: CategoryRef;
  subcategory: CategoryRef | null;
  cuisine: CategoryRef | null;
  mealType: CategoryRef | null;
  dishType: CategoryRef | null;
  rating: number | null;
  review: string;
  /** Optional long-form write-up: the backstory, the process. */
  story: string;
  visibility: Visibility;
  status: PostStatus;
  madeOn: string;
  wouldMakeAgain: boolean | null;
  recipeUrl: string | null;
  ingredients: string;
  prepNotes: string;
  nextTimeNotes: string;
  cookTimeMinutes: number | null;
  temperature: Temperature | null;
  milk: string | null;
  sweetener: string | null;
  likeCount: number;
  commentCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: PostImage[];
  tags: Tag[];
  viewerHasLiked: boolean;
  viewerHasSaved: boolean;
  /** Newest likers (feed only; empty elsewhere). */
  recentLikers: ProfileSummary[];
}

export interface Comment {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  author: ProfileSummary;
}

export type RankingSort = 'highest' | 'lowest' | 'recent' | 'oldest';

export interface RankingItem {
  rank: number;
  totalCount: number;
  postId: string;
  title: string;
  rating: number;
  madeOn: string;
  primarySlug: string;
  primaryName: string;
  secondaryName: string | null;
  thumbPath: string | null;
  thumbUrl: string | null;
}

export interface RankingFilterOption {
  kind: CategoryKind | 'tag';
  id: string;
  slug: string;
  name: string;
  postCount: number;
}

export interface Collection {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  itemCount: number;
  coverUrl: string | null;
  coverPath: string | null;
  updatedAt: string;
}

/** Keyset cursor for lists ordered by (timestamp desc, id desc). */
export interface Cursor {
  before: string;
  beforeId: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: Cursor | null;
}

export type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'harassment'
  | 'not_homemade'
  | 'intellectual_property'
  | 'other';

export type ReportTarget =
  | { type: 'user'; userId: string }
  | { type: 'post'; postId: string }
  | { type: 'comment'; commentId: string };

export interface UserListItem extends ProfileSummary {
  viewerIsFollowing: boolean;
}
