import type { RankingSort } from '@/types/models';

export interface RankingQueryParams {
  primaryId: string | null;
  categoryId: string | null;
  tagId: string | null;
  sort: RankingSort;
}

export interface DiscoverQueryParams {
  sort: 'recent' | 'top' | 'loved' | 'cheapest';
  primaryId?: string | null;
  categoryId?: string | null;
  tagId?: string | null;
  followingOnly?: boolean;
  sinceDays?: number | null;
  /** Budget Eats only, optionally at or under a cost per serving (cents). */
  budget?: boolean;
  maxCostCents?: number | null;
}

/**
 * Every query key in the app. Anything that returns posts lives under
 * ['posts', …] so like/save/delete can update all copies at once.
 */
export const queryKeys = {
  taxonomy: ['taxonomy'] as const,

  profile: (id: string) => ['profile', id] as const,
  profileStats: (id: string) => ['profile', id, 'stats'] as const,
  connections: (id: string, type: 'followers' | 'following') => ['connections', id, type] as const,
  userSearch: (q: string) => ['users', 'search', q] as const,
  /** Who liked a post (a user list, so follow buttons stay in sync). */
  likers: (postId: string) => ['users', 'likers', postId] as const,
  followRequests: ['follow-requests'] as const,
  blocked: ['users', 'blocked'] as const,

  posts: ['posts'] as const,
  feed: ['posts', 'feed'] as const,
  forYou: ['posts', 'for-you'] as const,
  post: (id: string) => ['posts', 'detail', id] as const,
  diary: (userId: string, primaryId: string | null) =>
    ['posts', 'diary', userId, primaryId ?? 'all'] as const,
  drafts: ['posts', 'drafts'] as const,
  saved: ['posts', 'saved'] as const,
  discover: (params: DiscoverQueryParams) => ['posts', 'discover', params] as const,
  postSearch: (q: string) => ['posts', 'search', q] as const,
  collectionPosts: (id: string) => ['posts', 'collection', id] as const,

  rankings: (userId: string, params: RankingQueryParams) => ['rankings', userId, params] as const,
  rankingsForUser: (userId: string) => ['rankings', userId] as const,
  rankingFilters: (userId: string) => ['ranking-filters', userId] as const,

  comments: (postId: string) => ['comments', postId] as const,
  replies: (parentId: string) => ['comments', 'replies', parentId] as const,

  collections: (userId: string) => ['collections', userId] as const,
  collection: (id: string) => ['collection', id] as const,
  postCollections: (postId: string) => ['post-collections', postId] as const,

  trending: ['discover', 'trending'] as const,
  tasteTopics: ['discover', 'taste-topics'] as const,
  tastePosts: ['posts', 'taste'] as const,
  tastePostsAll: ['posts', 'taste', 'all'] as const,
  mostHated: ['discover', 'most-hated'] as const,
  trendingCreations: ['posts', 'trending'] as const,
  newlyCooked: ['posts', 'newly-cooked'] as const,
  tagSuggestionLists: ['discover', 'tag-suggestions'] as const,
  tagSuggestions: (q: string) => ['tags', q] as const,
};
