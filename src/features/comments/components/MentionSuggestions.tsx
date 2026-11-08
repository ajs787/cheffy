import { memo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { colors, HAIRLINE, SCREEN_GUTTER, spacing } from '@/theme';

import type { MentionSuggestion } from '../api';

const ROW_HEIGHT = 52;
/** Four rows fit above the keyboard on the smallest iPhones. */
const MAX_ROWS = 4;

const RELATION_LABEL: Partial<Record<MentionSuggestion['relation'], string>> = {
  mutual: 'Friend',
  following: 'Following',
  follower: 'Follows you',
};

export interface MentionSuggestionsProps {
  results: MentionSuggestion[];
  loading: boolean;
  onPick: (user: MentionSuggestion) => void;
}

/** The small "@" panel that sits just above the comment box. */
function MentionSuggestionsBase({ results, loading, onPick }: MentionSuggestionsProps) {
  if (results.length === 0) {
    return loading ? (
      <View style={[styles.panel, styles.empty]}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    ) : null;
  }
  return (
    <View style={[styles.panel, { maxHeight: ROW_HEIGHT * MAX_ROWS }]} testID="mention-suggestions">
      <FlatList
        data={results}
        keyExtractor={(u) => u.id}
        // Taps land on a row without closing the keyboard first.
        keyboardShouldPersistTaps="always"
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onPick(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Mention ${item.displayName}, @${item.username}`}
            testID={`mention-option-${item.username}`}
          >
            <Avatar uri={item.avatarUrl} name={item.displayName} size="sm" />
            <View style={styles.names}>
              <AppText variant="calloutStrong" numberOfLines={1}>
                {item.displayName}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                @{item.username}
                {RELATION_LABEL[item.relation] ? ` · ${RELATION_LABEL[item.relation]}` : ''}
              </AppText>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

export const MentionSuggestions = memo(MentionSuggestionsBase);

const styles = StyleSheet.create({
  panel: {
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  empty: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
  },
  pressed: { backgroundColor: colors.tint },
  names: { flex: 1, gap: 1 },
});
