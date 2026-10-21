import { Users } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Chip, Collapsible } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { ProfileSummary } from '@/types/models';

import { PeoplePicker } from './PeoplePicker';

const MAX = 5;

/** Create's "Made with": pick co-creators to invite when the entry is posted. */
export function MadeWithField({
  people,
  onChange,
}: {
  people: ProfileSummary[];
  onChange: (p: ProfileSummary[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <Collapsible
      title="Made with"
      summary={
        people.length > 0
          ? people.map((p) => `@${p.username}`).join(', ')
          : 'Cooked together? Invite them to co-post it'
      }
      icon={Users}
      initiallyOpen={people.length > 0}
      testID="compose-made-with"
    >
      <View style={styles.body}>
        <View style={styles.chips}>
          {people.map((person) => (
            <Chip
              key={person.id}
              label={`@${person.username}`}
              selected
              onRemove={() => onChange(people.filter((p) => p.id !== person.id))}
            />
          ))}
          {people.length < MAX ? <Chip label="Add people…" onPress={() => setPicking(true)} /> : null}
        </View>
        <AppText variant="caption" color="textSecondary">
          They’ll be invited when you post. Each person adds their own rating.
        </AppText>
      </View>
      <PeoplePicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Made with"
        confirmLabel="Add"
        exclude={people.map((p) => p.id)}
        max={MAX - people.length}
        onConfirm={(picked) => onChange([...people, ...picked])}
      />
    </Collapsible>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, paddingHorizontal: SCREEN_GUTTER },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
