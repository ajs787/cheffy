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
  /** Full-framing photo (uploads since V3); null for older photos. */
  avatarOriginalPath: string | null;
  avatarOriginalUrl: string | null;
  createdAt: string;
  /** Private accounts approve followers; only followers see their content. */
  isPrivate: boolean;
  /** Unlocked profile style, shown to everyone. */
  theme: 'saffron' | null;
  frame: 'host' | null;
}

export interface ProfileWithViewer extends Profile {
  viewerIsFollowing: boolean;
  /** The viewer has a pending follow request to this account. */
  viewerHasRequested: boolean;
  viewerHasBlocked: boolean;
  /** Has co-created at least one creation ("Made Together"). */
  madeTogether: boolean;
}

/** Where the viewer stands with someone: drives the Follow button. */
export type FollowState = 'none' | 'requested' | 'following';

export function followStateOf(user: { viewerIsFollowing: boolean; viewerHasRequested?: boolean }): FollowState {
  if (user.viewerIsFollowing) return 'following';
  return user.viewerHasRequested ? 'requested' : 'none';
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
  /** Added by someone through "Other / Add custom". */
  isCustom: boolean;
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
  /** Custom labels by kind (and subtype parent): searchable, not listed by default. */
  custom: Category[];
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
  /** Every classification, in the order the author picked them. */
  subcategories: CategoryRef[];
  cuisines: CategoryRef[];
  mealType: CategoryRef | null;
  dishTypes: CategoryRef[];
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
  /** Accepted co-creators, each with their own rating and review. */
  coCreators: CoCreator[];
  /** Invitations still waiting (visible to the creator and the invitee only). */
  pendingInvitees: ProfileSummary[];
}

export interface Comment {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  author: ProfileSummary;
  /** Set on replies: the top-level comment they belong to. */
  parentId: string | null;
  /** Who a reply answers, shown as "@name". */
  replyTo: ProfileSummary | null;
  likeCount: number;
  replyCount: number;
  viewerHasLiked: boolean;
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
  viewerHasRequested: boolean;
  isPrivate: boolean;
}

export type CollaborationStatus = 'pending' | 'accepted' | 'declined' | 'removed';

export interface CoCreator {
  profile: ProfileSummary;
  /** Their own 0–10 rating; null until they rate it. */
  rating: number | null;
  review: string;
}

/** "Audrey", "Audrey and Sophie", "Audrey, Sophie and Jun". */
export function madeByNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
