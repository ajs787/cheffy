import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { CircleUserRound, Compass, House, ListOrdered, Plus, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PressableScale } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, HAIRLINE, iconSizes, radii, shadows, spacing, strokes } from '@/theme';

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  home: { label: 'Home', icon: House },
  discover: { label: 'Discover', icon: Compass },
  rankings: { label: 'Rankings', icon: ListOrdered },
  profile: { label: 'Profile', icon: CircleUserRound },
};

/** Home | Discover | (+) | Rankings | Profile — Create opens the compose modal. */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((route) => TABS[route.name]);

  const renderTab = (route: (typeof state.routes)[number]) => {
    const tab = TABS[route.name];
    if (!tab) return null;
    const focused = state.routes[state.index]?.key === route.key;
    const Icon = tab.icon;
    return (
      <PressableScale
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={tab.label}
        activeScale={0.92}
        onPress={() => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptics.selection();
            navigateToTab(route.key);
          }
        }}
        onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
        style={styles.tab}
      >
        <Icon
          size={iconSizes.lg}
          color={focused ? colors.text : colors.textTertiary}
          strokeWidth={focused ? strokes.bold : strokes.regular}
        />
        <AppText variant="caption" color={focused ? 'text' : 'textTertiary'} style={styles.label}>
          {tab.label}
        </AppText>
      </PressableScale>
    );
  };

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      accessibilityRole="tablist"
    >
      {routes.slice(0, 2).map(renderTab)}
      <View style={styles.createSlot}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Log something you made"
          activeScale={0.9}
          onPress={() => {
            haptics.medium();
            router.push('/compose');
          }}
          style={styles.create}
          testID="tab-create"
        >
          <Plus size={iconSizes.lg} color={colors.textInverse} strokeWidth={strokes.bold + 0.25} />
        </PressableScale>
      </View>
      {routes.slice(2).map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: spacing.xxs },
  label: { fontSize: 10.5, lineHeight: 13 },
  createSlot: { flex: 1, alignItems: 'center' },
  create: {
    width: 52,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    ...shadows.sm,
  },
});
