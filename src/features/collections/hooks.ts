import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRequiredUserId } from '@/features/auth/store';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { queryKeys } from '@/lib/query/keys';
import { toast } from '@/stores/toast';
import type { Cursor } from '@/types/models';

import {
  addToCollection,
  createCollection,
  deleteCollection,
  fetchCollection,
  fetchCollectionPostsPage,
  fetchCollections,
  fetchMyCollectionIdsForPost,
  fetchSavedPostsPage,
  removeFromCollection,
  updateCollection,
  type CollectionInput,
} from './api';

export function useCollections(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collections(ownerId ?? ''),
    queryFn: () => fetchCollections(ownerId!),
    enabled: !!ownerId,
  });
}

export function useCollection(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collection(id ?? ''),
    queryFn: () => fetchCollection(id!),
    enabled: !!id,
  });
}

export function useCollectionPosts(id: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.collectionPosts(id ?? ''),
    queryFn: ({ pageParam }) => fetchCollectionPostsPage(id!, pageParam),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!id,
  });
}

export function useSavedPosts() {
  const me = useRequiredUserId();
  return useInfiniteQuery({
    queryKey: queryKeys.saved,
    queryFn: ({ pageParam }) => fetchSavedPostsPage(me, pageParam),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

function useInvalidateCollections() {
  const qc = useQueryClient();
  const me = useRequiredUserId();
  return (collectionId?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.collections(me) }),
      collectionId ? qc.invalidateQueries({ queryKey: queryKeys.collection(collectionId) }) : null,
      collectionId ? qc.invalidateQueries({ queryKey: queryKeys.collectionPosts(collectionId) }) : null,
      qc.invalidateQueries({ queryKey: ['post-collections'] }),
    ]);
}

export function useCreateCollection() {
  const me = useRequiredUserId();
  const invalidate = useInvalidateCollections();
  return useMutation({
    mutationFn: (input: CollectionInput) => createCollection(me, input),
    onSuccess: () => {
      haptics.success();
      void invalidate();
    },
  });
}

export function useUpdateCollection(id: string) {
  const invalidate = useInvalidateCollections();
  return useMutation({
    mutationFn: (input: CollectionInput) => updateCollection(id, input),
    onSuccess: () => void invalidate(id),
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  const invalidate = useInvalidateCollections();
  return useMutation({
    mutationFn: (id: string) => deleteCollection(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.collection(id) });
      void invalidate();
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t delete the collection.')),
  });
}

export function useMyCollectionIdsForPost(postId: string | undefined) {
  const me = useRequiredUserId();
  return useQuery({
    queryKey: queryKeys.postCollections(postId ?? ''),
    queryFn: () => fetchMyCollectionIdsForPost(me, postId!),
    enabled: !!postId,
  });
}

export function useToggleCollectionItem(postId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateCollections();
  const key = queryKeys.postCollections(postId);
  return useMutation({
    mutationFn: ({ collectionId, add }: { collectionId: string; add: boolean }) =>
      add ? addToCollection(collectionId, postId) : removeFromCollection(collectionId, postId),
    onMutate: async ({ collectionId, add }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<string[]>(key);
      qc.setQueryData<string[]>(key, (ids = []) =>
        add ? [...new Set([...ids, collectionId])] : ids.filter((id) => id !== collectionId),
      );
      haptics.selection();
      return { previous };
    },
    onError: (error, _vars, context) => {
      qc.setQueryData(key, context?.previous);
      toast.error(toUserMessage(error, 'Couldn’t update the collection.'));
    },
    onSettled: (_data, _error, { collectionId }) => void invalidate(collectionId),
  });
}
