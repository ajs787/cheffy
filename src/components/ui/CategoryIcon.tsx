import { CakeSlice, Coffee, CookingPot, Utensils } from 'lucide-react-native';

import { categoryColors, colors, iconSizes, strokes } from '@/theme';

export function categoryColorFor(slug: string): string {
  return categoryColors[slug] ?? colors.rose;
}

export function CategoryIcon({
  slug,
  size = 'md',
  color,
}: {
  slug: string;
  size?: keyof typeof iconSizes;
  color?: string;
}) {
  const props = { size: iconSizes[size], color: color ?? categoryColorFor(slug), strokeWidth: strokes.regular };
  switch (slug) {
    case 'cooking':
      return <CookingPot {...props} />;
    case 'baking':
      return <CakeSlice {...props} />;
    case 'drinks':
      return <Coffee {...props} />;
    default:
      return <Utensils {...props} />;
  }
}
