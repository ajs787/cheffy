import type { WithSpringConfig } from 'react-native-reanimated';

export const springs = {
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  pop: { damping: 9, stiffness: 260, mass: 0.6 },
  sheet: { damping: 26, stiffness: 240, mass: 0.9 },
} satisfies Record<string, WithSpringConfig>;

export const durations = {
  fast: 140,
  normal: 220,
  slow: 320,
} as const;
