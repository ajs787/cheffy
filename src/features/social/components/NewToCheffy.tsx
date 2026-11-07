import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { AppText } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { ProfileSummary } from '@/types/models';

import type { NewMember } from '../api';
import { isRecentlyJoined, joinedLabel } from '../newMembers';
import { SuggestionCard } from './SuggestionCard';

/** Cards in the horizontal preview; "See all" pages through everyone. */
export const NEW_MEMBERS_SHOWN = 10;

function openProfile(person: ProfileSummary) {
  router.push({ pathname: '/user/[id]', params: { id: person.id } });
}

/**
 * "New to Cheffy": the newest members as compact cards (photo, name,
 * @username, when they joined, a "New" tag for the last 14 days, Follow),
 * scrolling sideways, with See all. Renders nothing when there's nobody.
 * `header` matches the screen: Discover's large section title, or the small
 * label Find Friends and Search use.
 */
export function NewToCheffy({
  people,
  header = 'section',
  onOpen = openProfile,
}: {
  people: readonly NewMember[];
  header?: 'section' | 'label';
  onOpen?: (p: ProfileSummary) => void;
}) {
  const shown = people.slice(0, NEW_MEMBERS_SHOWN);
  if (shown.length === 0) return null;
  const now = new Date();
  const seeAll = () => router.push('/new-members');

  return (
    <View style={header === 'section' ? styles.section : styles.compact}>
      {header === 'section' ? (
        <SectionHeader title="New to Cheffy" subtitle="Say hi to the newest cooks" onSeeAll={seeAll} />
      ) : (
        <View style={styles.labelRow}>
          <AppText variant="overline" color="textSecondary">
            New to Cheffy
          </AppText>
          <Pressable
            onPress={seeAll}
            hitSlop={10}
            accessibilityRole="link"
            accessibilityLabel="See all new members"
          >
            <AppText variant="caption" color="accent">
              See all
            </AppText>
          </Pressable>
        </View>
      )}
      <FlatList
        horizontal
        data={shown}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        initialNumToRender={3}
        windowSize={3}
        renderItem={({ item }) => (
          <SuggestionCard
            person={item}
            detail={joinedLabel(item.joinedAt, now)}
            badge={isRecentlyJoined(item.joinedAt, now) ? 'New' : undefined}
            onOpen={onOpen}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xxl },
  compact: { gap: spacing.sm },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
  },
  row: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
});
