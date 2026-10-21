import { requireOptionalNativeModule } from 'expo';
import { Share } from 'react-native';

type ClipboardModule = typeof import('expo-clipboard');
let clipboard: ClipboardModule | null | undefined;

/** expo-clipboard, or null on builds made before it was added. */
function getClipboard(): ClipboardModule | null {
  if (clipboard === undefined) {
    clipboard = requireOptionalNativeModule('ExpoClipboard')
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
        (require('expo-clipboard') as ClipboardModule)
      : null;
  }
  return clipboard;
}

/**
 * Copies text. Older builds without the clipboard module fall back to the
 * share sheet, which has its own Copy. Returns true when copied directly.
 */
export async function copyText(text: string): Promise<boolean> {
  const module = getClipboard();
  if (module) {
    await module.setStringAsync(text);
    return true;
  }
  await Share.share({ message: text });
  return false;
}
