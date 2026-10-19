import type { FlashListRef } from '@shopify/flash-list';
import { useScrollToTop } from 'expo-router';
import { useRef } from 'react';

/**
 * iOS convention: tapping the tab you're already on scrolls its list to the
 * top. Attach the returned ref to the screen's FlashList.
 */
export function useTabScrollToTop<T>() {
  const ref = useRef<FlashListRef<T>>(null);
  useScrollToTop(ref);
  return ref;
}
