import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import type { Comment } from '@/types/models';

import type { CommentCursor } from './api';

export type CommentPages = InfiniteData<Comment[], CommentCursor>;

/** Applies `fn` to the comment with `id` wherever it's cached (top level or a thread). */
export function updateCommentInCaches(qc: QueryClient, id: string, fn: (comment: Comment) => Comment): void {
  for (const [key, data] of qc.getQueriesData<CommentPages>({ queryKey: ['comments'] })) {
    if (!data || !('pages' in data)) continue;
    if (!data.pages.some((page) => page.some((c) => c.id === id))) continue;
    qc.setQueryData<CommentPages>(key, {
      ...data,
      pages: data.pages.map((page) => page.map((c) => (c.id === id ? fn(c) : c))),
    });
  }
}

/** Appends to the last page (comments read oldest first). */
export function appendComment(data: CommentPages | undefined, comment: Comment): CommentPages {
  if (!data || data.pages.length === 0) return { pages: [[comment]], pageParams: [null] };
  return {
    ...data,
    pages: data.pages.map((page, i) => (i === data.pages.length - 1 ? [...page, comment] : page)),
  };
}

export function replaceComment(
  data: CommentPages | undefined,
  id: string,
  next: Comment,
): CommentPages | undefined {
  return data
    ? { ...data, pages: data.pages.map((page) => page.map((c) => (c.id === id ? next : c))) }
    : data;
}

export function removeComment(data: CommentPages | undefined, id: string): CommentPages | undefined {
  return data ? { ...data, pages: data.pages.map((page) => page.filter((c) => c.id !== id)) } : data;
}

/** The cache a comment lives in: its thread, or the post's top level. */
export function cacheKeyFor(comment: Pick<Comment, 'postId' | 'parentId'>) {
  return comment.parentId ? queryKeys.replies(comment.parentId) : queryKeys.comments(comment.postId);
}
