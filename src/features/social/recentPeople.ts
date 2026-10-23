import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useUserId } from '@/features/auth/store';
import type { ProfileSummary } from '@/types/models';

/**
 * People you recently opened from Find Friends: kept on this phone, per
 * signed-in account (never mixed between accounts), newest first, at most 12.
 * Only public profile basics are stored.
 */
export const MAX_RECENTS = 12;
const keyFor = (userId: string) => `cheffy-recent-people:${userId}`;

/** Adds a person to the front, removing any older copy (pure). */
export function pushRecent(list: readonly ProfileSummary[], person: ProfileSummary): ProfileSummary[] {
  const slim: ProfileSummary = {
    id: person.id,
    username: person.username,
    displayName: person.displayName,
    avatarUrl: person.avatarUrl,
  };
  return [slim, ...list.filter((p) => p.id !== person.id)].slice(0, MAX_RECENTS);
}

export function useRecentPeople() {
  const me = useUserId();
  const [people, setPeople] = useState<ProfileSummary[]>([]);

  useEffect(() => {
    if (!me) return;
    let active = true;
    AsyncStorage.getItem(keyFor(me))
      .then((raw) => {
        if (active) setPeople(raw ? (JSON.parse(raw) as ProfileSummary[]) : []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [me]);

  const save = useCallback(
    (next: ProfileSummary[]) => {
      setPeople(next);
      if (me) void AsyncStorage.setItem(keyFor(me), JSON.stringify(next)).catch(() => undefined);
    },
    [me],
  );

  return {
    people,
    add: (person: ProfileSummary) => save(pushRecent(people, person)),
    remove: (id: string) => save(people.filter((p) => p.id !== id)),
    clear: () => save([]),
  };
}
