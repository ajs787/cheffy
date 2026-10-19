import type { Category, CategoryKind, Taxonomy } from '@/types/models';

export interface CategoryRow {
  id: string;
  kind: CategoryKind;
  parent_id: string | null;
  slug: string;
  name: string;
  sort_order: number;
}

export function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    kind: row.kind,
    parentId: row.parent_id,
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

const bySortOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function buildTaxonomy(categories: Category[]): Taxonomy {
  const sorted = [...categories].sort(bySortOrder);
  const byId: Record<string, Category> = {};
  const subcategoriesByPrimary: Record<string, Category[]> = {};
  for (const category of sorted) {
    byId[category.id] = category;
    if (category.kind === 'subcategory' && category.parentId) {
      (subcategoriesByPrimary[category.parentId] ??= []).push(category);
    }
  }
  const ofKind = (kind: CategoryKind) => sorted.filter((c) => c.kind === kind);
  return {
    all: sorted,
    byId,
    primaries: ofKind('primary'),
    subcategoriesByPrimary,
    cuisines: ofKind('cuisine'),
    mealTypes: ofKind('meal_type'),
    dishTypes: ofKind('dish_type'),
  };
}

/**
 * Which dimension a primary category shows as its quick pick in Create.
 * Data-driven: a primary with subcategories gets them; otherwise cuisine.
 * New primaries need no code change.
 */
export function quickPickFor(taxonomy: Taxonomy, primaryId: string | null): {
  kind: 'subcategory' | 'cuisine';
  label: string;
  options: Category[];
} {
  const subs = primaryId ? (taxonomy.subcategoriesByPrimary[primaryId] ?? []) : [];
  if (subs.length > 0) {
    return { kind: 'subcategory', label: 'What kind?', options: subs };
  }
  return { kind: 'cuisine', label: 'Cuisine', options: taxonomy.cuisines };
}

/** Category-specific optional fields in Create. */
export function detailFieldsFor(primarySlug: string | undefined): {
  drink: boolean;
  cookTime: boolean;
  recipe: boolean;
  dishType: boolean;
} {
  const drink = primarySlug === 'drinks';
  return {
    drink,
    cookTime: !drink,
    recipe: true,
    dishType: primarySlug === 'cooking',
  };
}
