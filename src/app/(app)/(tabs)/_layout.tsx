import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/shared/TabBar';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="rankings" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
