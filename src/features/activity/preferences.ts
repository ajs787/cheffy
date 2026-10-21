import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/store';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { fetchMaybe } from '@/lib/supabase/query';

export interface PushPreferences {
  follows: boolean;
  likes: boolean;
  comments: boolean;
}

export const DEFAULT_PREFERENCES: PushPreferences = { follows: true, likes: true, comments: true };

const preferencesKey = ['notification-preferences'] as const;

export async function fetchPreferences(): Promise<PushPreferences> {
  const row = await fetchMaybe<PushPreferences>(
    supabase.from('notification_preferences').select('follows, likes, comments').maybeSingle(),
  );
  return row ?? DEFAULT_PREFERENCES;
}

export async function savePreferences(userId: string, prefs: PushPreferences): Promise<void> {
  unwrap(
    await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() }),
  );
}

/** Which kinds of push someone wants (all on until they say otherwise). */
export function usePushPreferences() {
  const me = useUserId();
  return useQuery({ queryKey: preferencesKey, queryFn: fetchPreferences, enabled: !!me });
}

export function useSavePushPreferences() {
  const qc = useQueryClient();
  const me = useUserId();
  return useMutation({
    mutationFn: (prefs: PushPreferences) => savePreferences(me!, prefs),
    onMutate: (prefs) => {
      const previous = qc.getQueryData<PushPreferences>(preferencesKey);
      qc.setQueryData(preferencesKey, prefs);
      return { previous };
    },
    onError: (_error, _prefs, context) => {
      if (context?.previous) qc.setQueryData(preferencesKey, context.previous);
    },
  });
}
