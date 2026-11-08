import { requireOptionalNativeModule } from 'expo';
import type { ComponentType, ReactElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

type PastePayload =
  { type: 'text'; value: string } | { type: 'images'; uris: string[] } | { type: 'unsupported' };
type WrapperProps = { onPaste?: (payload: PastePayload) => void; children?: ReactElement; style?: unknown };

/**
 * expo-paste-input catches what React Native's TextInput drops: stickers and
 * Genmoji inserted from the iOS emoji keyboard (NSAdaptiveImageGlyph on iOS
 * 18+, NSTextAttachment on iOS 17) and pasted images. It's native code, so
 * builds made before it was added (and Expo Go) don't have it; then the
 * plain input is used and the attach menu's Paste / Choose Photo still work.
 */
const Wrapper: ComponentType<WrapperProps> | null =
  Platform.OS === 'ios' && requireOptionalNativeModule('ExpoPasteInput')
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-paste-input') as { TextInputWrapper: ComponentType<WrapperProps> }).TextInputWrapper
    : null;

/** True when keyboard stickers can be inserted straight into the comment box. */
export const KEYBOARD_STICKERS_SUPPORTED = Wrapper !== null;

export function StickerAwareInput({
  children,
  onImages,
  onUnsupported,
}: {
  children: ReactElement;
  /** Local file URIs of stickers/images inserted or pasted into the field. */
  onImages: (uris: string[]) => void;
  onUnsupported?: () => void;
}) {
  if (!Wrapper) return children;
  return (
    <Wrapper
      style={styles.flex}
      onPaste={(payload) => {
        if (payload.type === 'images' && payload.uris.length > 0) onImages(payload.uris);
        else if (payload.type === 'unsupported') onUnsupported?.();
      }}
    >
      <View style={styles.flex}>{children}</View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
