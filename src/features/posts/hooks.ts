import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useRequiredUserId, useUserId } from '@/features/auth/store';
import { removePostFromCaches, restorePostCaches, snapshotPostCaches } from '@/lib/query/cache';
import { invalidateAfterPostChange } from '@/lib/query/invalidate';
import { queryKeys } from '@/lib/query/keys';
import type { Cursor, Post } from '@/types/models';

import { deletePost, fetchDiaryPage, fetchDrafts, fetchPost } from './api';
import { savePost, type SavePostArgs } from './save';

/** Finds a post already loaded by a list so detail screens open instantly. */
function findCachedPost(qc: QueryClient, postId: string): Post | undefined {
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: queryKeys.posts })) {
    const candidates: unknown[] = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && 'pages' in data
        ? (data as { pages: { items: Post[] }[] }).pages.flatMap((p) => p.items)
        : [data];
    const match = candidates.find((p): p is Post => !!p && typeof p === 'object' && (p as Post).id === postId);
    if (match) return match;
  }
  return undefined;
}

export function usePost(postId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.post(postId ?? ''),
    queryFn: () => fetchPost(postId!),
    enabled: !!postId,
    placeholderData: () => (postId ? findCachedPost(qc, postId) : undefined),
  });
}

export function useDiary(userId: string | undefined, primaryId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.diary(userId ?? '', primaryId),
    queryFn: ({ pageParam }) => fetchDiaryPage(userId!, primaryId, pageParam),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!userId,
  });
}

export function useDrafts(enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.drafts,
    queryFn: () => fetchDrafts(userId!),
    enabled: enabled && !!userId,
  });
}

export function useSavePost() {
  const qc = useQueryClient();
  const userId = useRequiredUserId();
  return useMutation({
    mutationFn: (args: Omit<SavePostArgs, 'userId'>) => savePost({ ...args, userId }),
    onSuccess: async (postId) => {
      qc.removeQueries({ queryKey: queryKeys.post(postId), exact: true });
      await invalidateAfterPostChange(qc, userId);
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  const userId = useRequiredUserId();
  return useMutation({
    mutationFn: (post: Pick<Post, 'id' | 'images'>) => deletePost(post),
    onMutate: (post) => {
      const snapshot = snapshotPostCaches(qc);
      removePostFromCaches(qc, post.id);
      return { snapshot };
    },
    onError: (_error, _post, context) => {
      if (context) restorePostCaches(qc, context.snapshot);
    },
    onSettled: () => invalidateAfterPostChange(qc, userId),
  });
}
