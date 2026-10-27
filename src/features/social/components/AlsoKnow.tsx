import { StyleSheet, View } from 'react-native';

import { UserRow } from '@/components/shared/UserRow';
import { AppText } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { UserListItem } from '@/types/models';

import { useSuggestedFriends } from '../hooks';

/**
 * After people search results: a few suggestions that weren't in them.
 * Reuses the cached suggestions (no extra request once loaded) and is only
 * ever placed below the matches.
 */
export function AlsoKnow({
  exclude,
  onOpen,
}: {
  exclude: readonly { id: string }[];
  onOpen?: (user: UserListItem) => void;
}) {
  const suggested = useSuggestedFriends();
  const shown = new Set(exclude.map((u) => u.id));
  const people = (suggested.data ?? []).filter((p) => !shown.has(p.id)).slice(0, 3);
  if (people.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText variant="overline" color="textSecondary" style={styles.label}>
        You might also know
      </AppText>
      {people.map((person) => (
        <UserRow key={person.id} user={person} detail={person.reason} onOpen={onOpen} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: spacing.lg },
  label: { paddingHorizontal: SCREEN_GUTTER, paddingBottom: spacing.xs },
});
