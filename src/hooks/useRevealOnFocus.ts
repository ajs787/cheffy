import { useEffect, useRef, type RefObject } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { spacing } from '@/theme';

export interface Measurable {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

interface Scrollable extends Measurable {
  scrollTo: (options: { y: number; animated?: boolean }) => void;
}

/**
 * Scrolls a form so a focused field sits near the top of the visible area,
 * above the keyboard. Call `reveal(node)` from the field's onFocus; it runs
 * again once the keyboard has finished showing (the visible area shrinks).
 */
export function useRevealOnFocus(scrollRef: RefObject<Scrollable | null>) {
  const offset = useRef(0);
  const pending = useRef<Measurable | null>(null);

  const scrollTo = (node: Measurable) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    node.measureInWindow((_x, nodeY) => {
      scroll.measureInWindow((_sx, scrollY) => {
        const y = Math.max(0, offset.current + nodeY - scrollY - spacing.md);
        scroll.scrollTo({ y, animated: true });
      });
    });
  };

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (pending.current) scrollTo(pending.current);
      pending.current = null;
    });
    return () => sub.remove();
    // scrollTo only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
    },
    reveal: (node: Measurable | null) => {
      if (!node) return;
      pending.current = node;
      // Keyboard already up (moving between fields): no didShow will fire.
      if (Keyboard.isVisible()) scrollTo(node);
    },
  };
}
