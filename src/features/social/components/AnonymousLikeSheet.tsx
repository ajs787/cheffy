import { ChefHat } from 'lucide-react-native';
import { useCallback, useState } from 'react';

import { ActionSheet } from '@/components/ui';
import { useAnonymousTakesStatus } from '@/features/comments/anonymous';
import { haptics } from '@/lib/haptics';

/**
 * Long-press a heart → "Like anonymously". Only offered to accounts with
 * Anonymous Takes (same rollout); `onLongPress` is undefined otherwise, so
 * the heart behaves exactly as before.
 */
export function useAnonymousLikeMenu(onLikeAnonymously: () => void) {
  const { available } = useAnonymousTakesStatus(null);
  const [open, setOpen] = useState(false);
  // Mounted on first use only (feed cards are many), then kept so the sheet
  // can finish closing before its action runs.
  const [used, setUsed] = useState(false);
  const sheet = available && used ? (
    <ActionSheet
      visible={open}
      onClose={() => setOpen(false)}
      title="Your name won’t be shown. The like still counts."
      actions={[
        {
          key: 'like-anonymously',
          label: 'Like anonymously',
          icon: ChefHat,
          onPress: onLikeAnonymously,
        },
      ]}
    />
  ) : null;
  const show = useCallback(() => {
    haptics.selection();
    setUsed(true);
    setOpen(true);
  }, []);
  const onLongPress = available ? show : undefined;
  return { onLongPress, sheet };
}
