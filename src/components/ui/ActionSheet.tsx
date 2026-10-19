import { Check, type LucideIcon } from 'lucide-react-native';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, HIT_TARGET, iconSizes, spacing, strokes } from '@/theme';

import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { PressableScale } from './PressableScale';

export interface SheetAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  /** Shows a checkmark: the current choice in a pick-one menu. */
  selected?: boolean;
  onPress: () => void;
}

export interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: SheetAction[];
}

/** A list of actions in a bottom sheet (the "•••" menus). */
export function ActionSheet({ visible, onClose, title, actions }: ActionSheetProps) {
  // The chosen action runs only after the sheet's modal has fully dismissed:
  // iOS refuses to present another modal (photo picker, share sheet, dialog)
  // over one that is still closing.
  const pending = useRef<(() => void) | null>(null);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => {
        const action = pending.current;
        pending.current = null;
        action?.();
      }}
      title={title}
    >
      <View>
        {actions.map((action) => {
          const Icon = action.icon;
          const color = action.destructive ? colors.danger : colors.text;
          return (
            <PressableScale
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityState={action.selected === undefined ? undefined : { selected: action.selected }}
              activeScale={0.98}
              onPress={() => {
                pending.current = action.onPress;
                onClose();
              }}
              style={styles.row}
            >
              {Icon ? <Icon size={iconSizes.md} color={color} strokeWidth={strokes.regular} /> : null}
              <AppText variant="bodyStrong" color={action.destructive ? 'danger' : 'text'} style={styles.label}>
                {action.label}
              </AppText>
              {action.selected ? (
                <Check size={iconSizes.md} color={colors.accentStrong} strokeWidth={strokes.bold} />
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: HIT_TARGET + 8,
  },
  label: { flex: 1 },
});
