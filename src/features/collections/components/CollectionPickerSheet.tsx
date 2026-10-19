import { Check, Lock, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton, AppInput, AppText, BottomSheet, FoodImage, PressableScale } from '@/components/ui';
import { useRequiredUserId } from '@/features/auth/store';
import { toUserMessage } from '@/lib/errors';
import { colors, radii, spacing, strokes } from '@/theme';

import { useCollections, useCreateCollection, useMyCollectionIdsForPost, useToggleCollectionItem } from '../hooks';

export interface CollectionPickerSheetProps {
  postId: string | null;
  onClose: () => void;
}

/** Add or remove a post from any of my collections, or start a new one. */
export function CollectionPickerSheet({ postId, onClose }: CollectionPickerSheetProps) {
  const me = useRequiredUserId();
  // Only fetch while the picker is open; every post menu renders this sheet.
  const collections = useCollections(postId ? me : undefined);
  const memberOf = useMyCollectionIdsForPost(postId ?? undefined);
  const toggle = useToggleCollectionItem(postId ?? '');
  const create = useCreateCollection();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const selected = new Set(memberOf.data ?? []);

  const handleCreate = async () => {
    if (!postId || !name.trim()) return;
    setError(undefined);
    try {
      const id = await create.mutateAsync({ name, description: '', visibility: 'public' });
      toggle.mutate({ collectionId: id, add: true });
      setName('');
      setCreating(false);
    } catch (e) {
      setError(toUserMessage(e));
    }
  };

  return (
    <BottomSheet visible={!!postId} onClose={onClose} title="Add to collection">
      {collections.isLoading ? (
        <ActivityIndicator color={colors.textSecondary} style={styles.loading} />
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {(collections.data ?? []).map((collection) => {
            const isIn = selected.has(collection.id);
            return (
              <PressableScale
                key={collection.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isIn }}
                accessibilityLabel={collection.name}
                activeScale={0.98}
                onPress={() => postId && toggle.mutate({ collectionId: collection.id, add: !isIn })}
                style={styles.row}
              >
                <FoodImage uri={collection.coverUrl} cacheKey={collection.coverPath ?? undefined} style={styles.cover} radius="sm" />
                <View style={styles.rowText}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {collection.name}
                  </AppText>
                  <View style={styles.meta}>
                    {collection.visibility === 'private' ? (
                      <Lock size={12} color={colors.textSecondary} strokeWidth={strokes.bold} />
                    ) : null}
                    <AppText variant="caption" color="textSecondary">
                      {collection.itemCount} {collection.itemCount === 1 ? 'item' : 'items'}
                    </AppText>
                  </View>
                </View>
                <View style={[styles.check, isIn && styles.checkOn]}>
                  {isIn ? <Check size={14} color={colors.textInverse} strokeWidth={strokes.bold + 0.5} /> : null}
                </View>
              </PressableScale>
            );
          })}
        </ScrollView>
      )}
      {creating ? (
        <View style={styles.create}>
          <AppInput
            autoFocus
            placeholder="Collection name, e.g. Favorite Matcha"
            value={name}
            onChangeText={setName}
            maxLength={60}
            error={error}
            returnKeyType="done"
            onSubmitEditing={() => void handleCreate()}
          />
          <AppButton label="Create and add" onPress={handleCreate} loading={create.isPending} disabled={!name.trim()} fullWidth />
        </View>
      ) : (
        <AppButton label="New collection" icon={Plus} variant="secondary" onPress={() => setCreating(true)} fullWidth />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xxl },
  list: { maxHeight: 320, marginBottom: spacing.md },
  listContent: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  cover: { width: 48, height: 48 },
  rowText: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  check: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
  create: { gap: spacing.md },
});
