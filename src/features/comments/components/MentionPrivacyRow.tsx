import { AtSign } from 'lucide-react-native';
import { useState } from 'react';

import { SettingsRow } from '@/components/shared/SettingsRow';
import { ActionSheet } from '@/components/ui';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';

import {
  MENTION_POLICY_LABEL,
  useMentionPolicy,
  useSetMentionPolicy,
  type MentionPolicy,
} from '../mentionPolicy';

const CHOICES: MentionPolicy[] = ['everyone', 'following', 'nobody'];

/** Settings row: who can @mention you in comments. */
export function MentionPrivacyRow() {
  const policy = useMentionPolicy();
  const save = useSetMentionPolicy();
  const [open, setOpen] = useState(false);
  const current = policy.data ?? 'everyone';
  return (
    <>
      <SettingsRow
        icon={AtSign}
        label="Who can @mention you"
        value={MENTION_POLICY_LABEL[current]}
        onPress={() => setOpen(true)}
      />
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Who can @mention you"
        actions={CHOICES.map((choice) => ({
          key: choice,
          label: MENTION_POLICY_LABEL[choice],
          selected: choice === current,
          onPress: () =>
            save.mutate(choice, {
              onError: (error) => toast.error(toUserMessage(error, 'Couldn’t change this setting.')),
            }),
        }))}
      />
    </>
  );
}
