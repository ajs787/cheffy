import { StyleSheet, View } from 'react-native';

import { Chip, type ChipProps } from './Chip';
import { categoryColorFor } from './CategoryIcon';

export interface CategoryChipProps extends Omit<ChipProps, 'leading'> {
  /** Primary category slug — drives the identity dot. */
  slug?: string;
}

/** A chip with a small category-colored dot. */
export function CategoryChip({ slug, ...rest }: CategoryChipProps) {
  return (
    <Chip
      {...rest}
      leading={slug ? <View style={[styles.dot, { backgroundColor: categoryColorFor(slug) }]} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  dot: { width: 7, height: 7, borderRadius: 4 },
});
