import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore, useUserId } from '@/features/auth/store';
import { queryKeys } from '@/lib/query/keys';

import {
  createProfile,
  deleteAccount,
  fetchMyProfile,
  fetchProfile,
  fetchProfileStats,
  updateProfile,
  type ProfileInput,
} from './api';

export function useMyProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.profile(userId ?? 'anonymous'),
    queryFn: () => fetchMyProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.profile(userId ?? ''), 'viewer'],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  });
}

export function useProfileStats(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profileStats(userId ?? ''),
    queryFn: () => fetchProfileStats(userId!),
    enabled: !!userId,
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: ProfileInput) => createProfile(userId!, input),
    onSuccess: (profile) => qc.setQueryData(queryKeys.profile(profile.id), profile),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const userId = useUserId();
  const { data: current } = useMyProfile();
  return useMutation({
    mutationFn: (input: ProfileInput) => {
      if (!userId || !current) throw new Error('Profile not loaded');
      return updateProfile(userId, current, input);
    },
    onSuccess: (profile) => {
      qc.setQueryData(queryKeys.profile(profile.id), profile);
      // Names and avatars are embedded in posts and lists.
      void qc.invalidateQueries({ queryKey: queryKeys.posts });
      void qc.invalidateQueries({ queryKey: [...queryKeys.profile(profile.id), 'viewer'] });
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not signed in');
      await deleteAccount(userId);
    },
  });
}
