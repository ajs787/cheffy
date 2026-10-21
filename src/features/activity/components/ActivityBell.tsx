import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, IconButton } from '@/components/ui';
import { colors, fonts } from '@/theme';

import { useUnreadCount } from '../hooks';

/** Caps the badge at "9+" so it stays a badge. */
export function badgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}

/** Home's activity button, with an oxblood count badge for unread notifications. */
export function ActivityBell() {
  const { data: unread = 0 } = useUnreadCount();
  return (
    <View>
      <IconButton
        icon={Bell}
        label={unread > 0 ? `Activity, ${unread} new` : 'Activity'}
        onPress={() => router.push('/activity')}
      />
      {unread > 0 ? (
        <View pointerEvents="none" style={styles.badge} accessibilityElementsHidden>
          <AppText style={styles.badgeText} maxFontSizeMultiplier={1.2}>
            {badgeLabel(unread)}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  badgeText: { fontFamily: fonts.textSemiBold, fontSize: 11, lineHeight: 13, color: colors.ivory },
});
