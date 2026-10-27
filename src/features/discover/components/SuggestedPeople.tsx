import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { SuggestionCard } from '@/features/social/components/SuggestionCard';
import { useDismissSuggestion, useSuggestedFriends } from '@/features/social/hooks';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { ProfileSummary } from '@/types/models';

const SHOWN = 8;

function openProfile(person: ProfileSummary) {
  router.push({ pathname: '/user/[id]', params: { id: person.id } });
}

/**
 * Discover's people row: the same suggestions (and cache) as Find Friends,
 * each with its real reason, Follow, and dismiss. Nothing shows until there
 * is someone to suggest.
 */
export function SuggestedPeople() {
  const suggested = useSuggestedFriends();
  const dismiss = useDismissSuggestion();
  const people = (suggested.data ?? []).slice(0, SHOWN);
  if (people.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Suggested for you"
        onSeeAll={(suggested.data?.length ?? 0) > 3 ? () => router.push('/suggested') : undefined}
      />
      <FlatList
        horizontal
        data={people}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        initialNumToRender={3}
        renderItem={({ item }) => (
          <SuggestionCard person={item} onOpen={openProfile} onDismiss={(id) => dismiss.mutate(id)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xxl },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
});
