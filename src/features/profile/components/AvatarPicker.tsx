import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, PressableScale } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';
import { colors, spacing, strokes } from '@/theme';

export interface AvatarPickerProps {
  uri: string | null;
  name: string;
  onPick: (localUri: string) => void;
  onRemove?: () => void;
}

export function AvatarPicker({ uri, name, onPick, onRemove }: AvatarPickerProps) {
  const pick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      const asset = result.assets?.[0];
      if (!result.canceled && asset) {
        haptics.selection();
        onPick(asset.uri);
      }
    } catch {
      toast.error('Couldn’t open your photos. Check Cheffy’s Photos permission in Settings.');
    }
  };

  return (
    <View style={styles.container}>
      <PressableScale
        onPress={pick}
        accessibilityRole="button"
        accessibilityLabel={uri ? 'Change profile photo' : 'Add profile photo'}
        style={styles.avatarWrap}
      >
        <Avatar uri={uri} name={name || '?'} size="xl" />
        <View style={styles.badge}>
          <Camera size={16} color={colors.textInverse} strokeWidth={strokes.bold} />
        </View>
      </PressableScale>
      {uri && onRemove ? (
        <AppText variant="calloutStrong" color="textSecondary" onPress={onRemove} accessibilityRole="button">
          Remove photo
        </AppText>
      ) : (
        <AppText variant="callout" color="textSecondary">
          {uri ? 'Tap to change' : 'Add a photo'}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.sm },
  avatarWrap: { position: 'relative' },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
