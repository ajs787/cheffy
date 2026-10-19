import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors, fonts } from '@/theme';
import { initials } from '@/utils/format';

import { AppText } from './AppText';

const SIZES = { xs: 24, sm: 32, md: 40, lg: 72, xl: 96 } as const;

export interface AvatarProps {
  uri: string | null | undefined;
  name: string;
  size?: keyof typeof SIZES;
}

export function Avatar({ uri, name, size = 'md' }: AvatarProps) {
  const dimension = SIZES[size];
  const style = { width: dimension, height: dimension, borderRadius: dimension / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.base, style]}
        contentFit="cover"
        transition={150}
        accessibilityLabel={`${name}'s profile photo`}
      />
    );
  }

  return (
    <View style={[styles.base, styles.fallback, style]} accessibilityLabel={`${name}'s profile photo`}>
      <AppText
        style={{ fontFamily: fonts.serif, fontSize: dimension * 0.38, lineHeight: dimension * 0.46 }}
        color="sageStrong"
      >
        {initials(name)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sageSoft },
});
