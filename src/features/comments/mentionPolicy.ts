import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/store';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { fetchOne } from '@/lib/supabase/query';

/** Who can @mention you in comments (and so reach you with a notification). */
export type MentionPolicy = 'everyone' | 'following' | 'nobody';

export const MENTION_POLICY_LABEL: Record<MentionPolicy, string> = {
  everyone: 'Everyone',
  following: 'People you follow',
  nobody: 'No one',
};

const key = (me: string | null) => ['mention-policy', me ?? ''] as const;

export function useMentionPolicy() {
  const me = useUserId();
  return useQuery({
    queryKey: key(me),
    queryFn: async () =>
      (
        await fetchOne<{ mention_policy: MentionPolicy }>(
          supabase.from('profiles').select('mention_policy').eq('id', me!).single(),
        )
      ).mention_policy,
    enabled: !!me,
  });
}

export function useSetMentionPolicy() {
  const me = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (policy: MentionPolicy) =>
      unwrap(await supabase.from('profiles').update({ mention_policy: policy }).eq('id', me!)),
    onMutate: (policy) => {
      const previous = qc.getQueryData<MentionPolicy>(key(me));
      qc.setQueryData(key(me), policy);
      return { previous };
    },
    onError: (_error, _policy, context) => {
      if (context?.previous) qc.setQueryData(key(me), context.previous);
    },
  });
}
