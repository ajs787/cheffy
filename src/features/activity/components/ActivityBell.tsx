import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui';
import { colors } from '@/theme';

import { useHasUnreadActivity } from '../hooks';

/** Home's activity button, with an oxblood dot when something new happened. */
export function ActivityBell() {
  const unread = useHasUnreadActivity();
  return (
    <View>
      <IconButton
        icon={Bell}
        label={unread ? 'Activity, new' : 'Activity'}
        onPress={() => router.push('/activity')}
      />
      {unread ? <View pointerEvents="none" style={styles.dot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
});
