import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { NewToCheffy } from '@/features/social/components/NewToCheffy';
import { SuggestionCard } from '@/features/social/components/SuggestionCard';
import { useDiscoveryPeople, useDismissSuggestion } from '@/features/social/hooks';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { SuggestedFriend } from '@/features/social/api';
import type { ProfileSummary } from '@/types/models';

const SHOWN = 8;

function openProfile(person: ProfileSummary) {
  router.push({ pathname: '/user/[id]', params: { id: person.id } });
}

/**
 * Discover's people: "Suggested for you" (the same suggestions and cache as
 * Find Friends, each with its real reason, Follow, and dismiss), then "New to
 * Cheffy". Nobody appears in both; each row hides itself when empty.
 */
export function SuggestedPeople() {
  const { suggested, newcomers, suggestedQuery } = useDiscoveryPeople();
  return (
    <>
      <SuggestedRow people={suggested} total={suggestedQuery.data?.length ?? 0} />
      <NewToCheffy people={newcomers} />
    </>
  );
}

function SuggestedRow({ people: all, total }: { people: readonly SuggestedFriend[]; total: number }) {
  const dismiss = useDismissSuggestion();
  const people = all.slice(0, SHOWN);
  if (people.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Suggested for you"
        onSeeAll={total > 3 ? () => router.push('/suggested') : undefined}
      />
      <FlatList
        horizontal
        data={people}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        initialNumToRender={3}
        renderItem={({ item }) => (
          <SuggestionCard
            person={item}
            detail={item.reason}
            onOpen={openProfile}
            onDismiss={(id) => dismiss.mutate(id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xxl },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
});
