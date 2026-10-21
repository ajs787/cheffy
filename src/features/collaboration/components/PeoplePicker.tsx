import { Check, Search, X } from 'lucide-react-native';
import { useDeferredValue, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppText, Avatar, Chip } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { useConnections, useUserSearch } from '@/features/social/hooks';
import { haptics } from '@/lib/haptics';
import {
  colors,
  fonts,
  HAIRLINE,
  iconSizes,
  MAX_FONT_SCALE,
  radii,
  SCREEN_GUTTER,
  spacing,
  strokes,
} from '@/theme';
import type { ProfileSummary } from '@/types/models';

export interface PeoplePickerProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  confirmLabel: string;
  /** Already involved (creator, co-creators, pending): not offered. */
  exclude: readonly string[];
  /** At most this many may be picked. */
  max: number;
  onConfirm: (people: ProfileSummary[]) => void;
}

/**
 * Pick existing Cheffy users: people you follow first, or search anyone.
 * A native page sheet with an uncontrolled search field.
 */
export function PeoplePicker({
  visible,
  onClose,
  title,
  confirmLabel,
  exclude,
  max,
  onConfirm,
}: PeoplePickerProps) {
  const insets = useSafeAreaInsets();
  const me = useUserId();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [typed, setTyped] = useState('');
  const query = useDeferredValue(typed.trim());
  const [picked, setPicked] = useState<ProfileSummary[]>([]);
  const following = useConnections(me ?? undefined, 'following');
  const search = useUserSearch(query);

  const excluded = new Set([...exclude, me ?? '']);
  const source = query ? (search.data ?? []) : (following.data?.pages.flat() ?? []);
  const people = source.filter((p) => !excluded.has(p.id));
  const isPicked = (id: string) => picked.some((p) => p.id === id);

  const toggle = (person: ProfileSummary) => {
    haptics.selection();
    setPicked((current) =>
      current.some((p) => p.id === person.id)
        ? current.filter((p) => p.id !== person.id)
        : current.length >= max
          ? current
          : [...current, person],
    );
  };
  const close = () => {
    setPicked([]);
    setTyped('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel">
            <AppText variant="callout" color="textSecondary">
              Cancel
            </AppText>
          </Pressable>
          <AppText variant="title3" accessibilityRole="header">
            {title}
          </AppText>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.search}>
          <Search size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
          <TextInput
            ref={input}
            onChangeText={setTyped}
            placeholder="Search by name or @username"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            accessibilityLabel="Search people"
            style={styles.searchInput}
          />
          {typed ? (
            <Pressable
              onPress={() => {
                input.current?.clear();
                setTyped('');
              }}
              hitSlop={8}
              accessibilityLabel="Clear search"
            >
              <X size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
            </Pressable>
          ) : null}
        </View>

        {picked.length > 0 ? (
          <View style={styles.picked}>
            {picked.map((person) => (
              <Chip
                key={person.id}
                label={`@${person.username}`}
                size="sm"
                selected
                onRemove={() => toggle(person)}
              />
            ))}
          </View>
        ) : null}

        <AppText variant="overline" color="textSecondary" style={styles.heading}>
          {query ? 'Results' : 'People you follow'}
        </AppText>
        <FlatList
          data={people}
          keyExtractor={(person) => person.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            const on = isPicked(item.id);
            return (
              <Pressable
                onPress={() => toggle(item)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !on && picked.length >= max }}
                accessibilityLabel={`${item.displayName}, @${item.username}`}
              >
                <Avatar uri={item.avatarUrl} name={item.displayName} size="md" />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {item.displayName}
                  </AppText>
                  <AppText variant="callout" color="textSecondary" numberOfLines={1}>
                    @{item.username}
                  </AppText>
                </View>
                {on ? <Check size={iconSizes.md} color={colors.accent} strokeWidth={strokes.bold} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <AppText variant="callout" color="textSecondary" style={styles.empty}>
              {query ? 'No one matches.' : 'Search for anyone on Cheffy.'}
            </AppText>
          }
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <AppText variant="caption" color="textTertiary" align="center">
            They’ll get an invitation to accept or decline.
          </AppText>
          <AppButton
            label={picked.length > 1 ? `${confirmLabel} (${picked.length})` : confirmLabel}
            fullWidth
            disabled={picked.length === 0}
            onPress={() => {
              onConfirm(picked);
              close();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerSpacer: { width: 48 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: SCREEN_GUTTER,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontFamily: fonts.text, fontSize: 16, color: colors.text, paddingVertical: 0 },
  picked: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.md,
  },
  heading: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: colors.tint },
  flex: { flex: 1 },
  empty: { paddingHorizontal: SCREEN_GUTTER, paddingTop: spacing.md },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm,
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.border,
  },
});
