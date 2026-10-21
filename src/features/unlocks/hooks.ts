import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useUserId } from '@/features/auth/store';
import { toUserMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/query/keys';
import { toast } from '@/stores/toast';

import {
  fetchInviteCode,
  fetchRecap,
  fetchUnlocks,
  redeemInviteCode,
  setProfileStyle,
  type ProfileFrame,
  type ProfileTheme,
  type Unlock,
} from './api';
import { newlyUnlocked, UNLOCKS } from './rules';

export const unlocksKey = ['unlocks'] as const;

export function useUnlocks() {
  const me = useUserId();
  return useQuery({ queryKey: unlocksKey, queryFn: fetchUnlocks, enabled: !!me, staleTime: 60_000 });
}

export function useInviteCode() {
  const me = useUserId();
  return useQuery({
    queryKey: ['invite-code'],
    queryFn: fetchInviteCode,
    enabled: !!me,
    staleTime: Infinity,
  });
}

export function useRecap(enabled: boolean) {
  return useQuery({ queryKey: ['recap'], queryFn: fetchRecap, enabled, staleTime: 5 * 60_000 });
}

export function useSetProfileStyle() {
  const qc = useQueryClient();
  const me = useUserId();
  return useMutation({
    mutationFn: ({ theme, frame }: { theme: ProfileTheme; frame: ProfileFrame }) =>
      setProfileStyle(theme, frame),
    onSuccess: () => {
      if (!me) return;
      void qc.invalidateQueries({ queryKey: queryKeys.profile(me) });
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t update your profile style.')),
  });
}

export function useRedeemInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => redeemInviteCode(code),
    onSuccess: () => {
      toast.success('Invite code applied — your friend thanks you');
      void qc.invalidateQueries({ queryKey: unlocksKey });
    },
    onError: (error) => toast.error(toUserMessage(error, 'Couldn’t use that code.')),
  });
}

const SEEN_KEY = 'cheffy-unlocks-seen';

/**
 * One quiet toast when something new unlocks (never a popup, never twice).
 * The first run just records what's already unlocked.
 */
export function useAnnounceUnlocks() {
  const { data } = useUnlocks();
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    void (async () => {
      const raw = await AsyncStorage.getItem(SEEN_KEY).catch(() => null);
      if (cancelled) return;
      const seen = raw ? (JSON.parse(raw) as Unlock[]) : null;
      await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(data.unlocked)).catch(() => undefined);
      if (!seen) return;
      const fresh = newlyUnlocked(data.unlocked, seen)[0];
      const info = UNLOCKS.find((u) => u.id === fresh);
      if (info) {
        toast.success(`Unlocked: ${info.title}`);
        if (info.id !== 'made_together') setTimeout(() => router.prefetch('/personalize'), 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);
}

/**
 * Redeems an invite code saved from a cheffy://invite link, once the person
 * is signed in with a profile. Quiet unless it worked; cleared either way.
 */
export function useRedeemPendingInvite() {
  const me = useUserId();
  const qc = useQueryClient();
  useEffect(() => {
    if (!me) return;
    void (async () => {
      const code = await AsyncStorage.getItem('cheffy-pending-invite').catch(() => null);
      if (!code) return;
      await AsyncStorage.removeItem('cheffy-pending-invite').catch(() => undefined);
      try {
        await redeemInviteCode(code);
        toast.success('Welcome! Your friend has been credited for inviting you.');
        void qc.invalidateQueries({ queryKey: unlocksKey });
      } catch {
        // Not eligible (e.g. not a new account) — nothing to say.
      }
    })();
  }, [me, qc]);
}
