import { Stack } from 'expo-router';

import { colors } from '@/theme';

export const unstable_settings = {
  // Deep links (e.g. cheffy://post/123) open on top of the tabs so Back works.
  anchor: '(tabs)',
};

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
      <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
      <Stack.Screen name="collection/edit" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
