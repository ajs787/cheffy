import { router } from 'expo-router';
import { Hash, PiggyBank, Sparkles, UtensilsCrossed } from 'lucide-react-native';
import { memo } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { PostGridItem } from '@/components/shared/PostGridItem';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { AppText, PressableScale, Skeleton } from '@/components/ui';
import { colors, HAIRLINE, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import { formatCount } from '@/utils/format';

import { topicBrowseParams, type TasteTopic } from '../api';
import { useTasteSection, useTasteTopics } from '../hooks';

const CARD_WIDTH = 148;

/** Opens the posts a topic counts (the same filter Browse uses). */
export function openTopic(topic: TasteTopic) {
  router.push({ pathname: '/browse', params: topicBrowseParams(topic) });
}

/** One compact chip: icon, name (long names truncate), and the real count. */
export const TopicChip = memo(function TopicChip({ topic }: { topic: TasteTopic }) {
  const Icon = topic.kind === 'budget' ? PiggyBank : topic.kind === 'tag' ? Hash : UtensilsCrossed;
  return (
    <PressableScale
      onPress={() => openTopic(topic)}
      activeScale={0.96}
      accessibilityRole="link"
      accessibilityLabel={`${topic.kind === 'tag' ? '#' : ''}${topic.name}, ${topic.postCount} creations`}
      style={[styles.chip, topic.personal && styles.chipPersonal]}
    >
      <Icon size={14} color={topic.personal ? colors.accent : colors.textSecondary} strokeWidth={strokes.bold} />
      <AppText variant="calloutStrong" numberOfLines={1} style={styles.chipLabel}>
        {topic.name}
      </AppText>
      <AppText variant="caption" color="textTertiary">
        {formatCount(topic.postCount)}
      </AppText>
    </PressableScale>
  );
});

/** Horizontal chips; the last one scrolls fully into view. */
export function TopicChips({ topics }: { topics: TasteTopic[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityLabel="Suggested tags"
    >
      {topics.map((topic) => (
        <TopicChip key={`${topic.kind}:${topic.id ?? topic.slug}`} topic={topic} />
      ))}
    </ScrollView>
  );
}

/**
 * Directly under Discover's search bar: topics to explore, then creations
 * picked from what the viewer makes, likes and saves. New cooks (no
 * activity yet) get genuinely popular topics and recent, well-rated posts.
 * Renders nothing until real content backs it.
 */
export function ForYourTaste() {
  const topics = useTasteTopics();
  const posts = useTasteSection();
  const topicList = topics.data ?? [];
  const postList = posts.data ?? [];
  const personal = topicList.some((t) => t.personal);

  if (topics.isPending && posts.isPending) {
    return (
      <View style={styles.section}>
        <View style={styles.skeletonRow}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={CARD_WIDTH} height={CARD_WIDTH * 1.2} radius={radii.md} />
          ))}
        </View>
      </View>
    );
  }
  if (topicList.length === 0 && postList.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title="For Your Taste"
        subtitle={personal ? 'Picked from what you make and love' : 'Popular on Cheffy right now'}
        onSeeAll={postList.length >= 4 ? () => router.push('/taste') : undefined}
      />
      {topicList.length > 0 ? <TopicChips topics={topicList} /> : null}
      {postList.length > 0 ? (
        <FlatList
          horizontal
          data={postList}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => <PostGridItem post={item} size={CARD_WIDTH} variant="card" showDetail />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}
          initialNumToRender={3}
          windowSize={3}
        />
      ) : (
        <View style={styles.quiet}>
          <Sparkles size={14} color={colors.textTertiary} strokeWidth={strokes.regular} />
          <AppText variant="caption" color="textTertiary">
            Like or save a few creations and this fills up with more like them.
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xxl },
  chips: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    maxWidth: 240,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipPersonal: { backgroundColor: colors.tint, borderColor: colors.tint },
  chipLabel: { flexShrink: 1 },
  cards: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.md },
  skeletonRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: SCREEN_GUTTER },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: SCREEN_GUTTER },
});
