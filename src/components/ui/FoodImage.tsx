import { Image, type ImageProps } from 'expo-image';
import { UtensilsCrossed } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, iconSizes, radii, strokes } from '@/theme';

export interface FoodImageProps {
  uri: string | null | undefined;
  /** Stable key (storage path) so re-signed URLs reuse the disk cache. */
  cacheKey?: string;
  aspectRatio?: number;
  radius?: keyof typeof radii | 0;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  priority?: ImageProps['priority'];
  recyclingKey?: string;
}

/** Food photo with consistent cropping, a warm placeholder and a soft fade-in. */
export function FoodImage({
  uri,
  cacheKey,
  aspectRatio,
  radius = 'md',
  style,
  accessibilityLabel,
  priority = 'normal',
  recyclingKey,
}: FoodImageProps) {
  const borderRadius = radius === 0 ? 0 : radii[radius];
  return (
    <View style={[styles.frame, { borderRadius, aspectRatio }, style]}>
      {uri ? (
        <Image
          source={{ uri, cacheKey }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          priority={priority}
          cachePolicy="disk"
          recyclingKey={recyclingKey ?? cacheKey}
          accessibilityLabel={accessibilityLabel}
          accessible={!!accessibilityLabel}
        />
      ) : (
        <View style={styles.empty}>
          <UtensilsCrossed size={iconSizes.lg} color={colors.borderStrong} strokeWidth={strokes.regular} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  empty: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
