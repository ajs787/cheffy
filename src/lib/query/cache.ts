import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { Page, Post } from '@/types/models';

import { queryKeys } from './keys';

type PostCacheShape = Post | Post[] | InfiniteData<Page<Post>> | undefined | null;

function isPost(value: unknown): value is Post {
  return typeof value === 'object' && value !== null && 'id' in value && 'author' in value && 'title' in value;
}

function isInfinitePages(value: unknown): value is InfiniteData<Page<Post>> {
  return typeof value === 'object' && value !== null && 'pages' in value && Array.isArray((value as InfiniteData<unknown>).pages);
}

/** Applies `fn` to every post in a cached value, whatever its shape. */
export function mapPostsInData(data: PostCacheShape, fn: (post: Post) => Post | null): PostCacheShape {
  if (!data) return data;
  if (isInfinitePages(data)) {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map(fn).filter((p): p is Post => p !== null),
      })),
    };
  }
  if (Array.isArray(data)) {
    return data.map(fn).filter((p): p is Post => p !== null);
  }
  if (isPost(data)) {
    return fn(data);
  }
  return data;
}

/** Updates one post everywhere it is cached (feed, detail, grids, search…). */
export function updatePostInCaches(qc: QueryClient, postId: string, update: (post: Post) => Post): void {
  for (const [key, data] of qc.getQueriesData<PostCacheShape>({ queryKey: queryKeys.posts })) {
    qc.setQueryData(key, mapPostsInData(data, (post) => (post.id === postId ? update(post) : post)));
  }
}

/** Removes a post from every cached list (deleted, blocked, hidden). */
export function removePostFromCaches(qc: QueryClient, postId: string): void {
  for (const [key, data] of qc.getQueriesData<PostCacheShape>({ queryKey: queryKeys.posts })) {
    if (isPost(data) && data.id === postId) {
      qc.removeQueries({ queryKey: key, exact: true });
      continue;
    }
    qc.setQueryData(key, mapPostsInData(data, (post) => (post.id === postId ? null : post)));
  }
}

/** Removes every post by an author from cached lists (after blocking). */
export function removeAuthorFromCaches(qc: QueryClient, authorId: string): void {
  for (const [key, data] of qc.getQueriesData<PostCacheShape>({ queryKey: queryKeys.posts })) {
    if (isPost(data) && data.author.id === authorId) {
      qc.removeQueries({ queryKey: key, exact: true });
      continue;
    }
    qc.setQueryData(key, mapPostsInData(data, (post) => (post.author.id === authorId ? null : post)));
  }
}

/** Snapshot of all post caches, for optimistic-update rollback. */
export function snapshotPostCaches(qc: QueryClient) {
  return qc.getQueriesData<PostCacheShape>({ queryKey: queryKeys.posts });
}

export function restorePostCaches(qc: QueryClient, snapshot: ReturnType<typeof snapshotPostCaches>): void {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}
