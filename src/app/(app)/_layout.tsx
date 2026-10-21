import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { NotificationBannerHost } from '@/features/activity/components/NotificationBannerHost';
import { PushHost } from '@/features/activity/components/PushHost';
import { colors } from '@/theme';

export const unstable_settings = {
  // Deep links (e.g. cheffy://post/123) open on top of the tabs so Back works.
  anchor: '(tabs)',
};

export default function AppLayout() {
  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="compose" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="collection/edit" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
      {/* Live activity banners (signed-in only). */}
      <NotificationBannerHost />
      <PushHost />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
