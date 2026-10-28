import type { Category, CategoryKind, Taxonomy } from '@/types/models';

export interface CategoryRow {
  id: string;
  kind: CategoryKind;
  parent_id: string | null;
  slug: string;
  name: string;
  sort_order: number;
  is_custom?: boolean;
  is_active?: boolean;
}

export function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    kind: row.kind,
    parentId: row.parent_id,
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
    isCustom: row.is_custom ?? false,
    isActive: row.is_active ?? true,
  };
}

const bySortOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function buildTaxonomy(categories: Category[]): Taxonomy {
  const sorted = [...categories].sort(bySortOrder);
  const byId: Record<string, Category> = {};
  const subcategoriesByPrimary: Record<string, Category[]> = {};
  for (const category of sorted) {
    byId[category.id] = category;
    if (category.kind === 'subcategory' && category.parentId && !category.isCustom && category.isActive) {
      (subcategoriesByPrimary[category.parentId] ??= []).push(category);
    }
  }
  // Default lists show built-in choices; custom labels are found by search.
  // Retired choices are in byId (for posts that use them) and nowhere else.
  const offered = sorted.filter((c) => c.isActive);
  const ofKind = (kind: CategoryKind) => offered.filter((c) => c.kind === kind && !c.isCustom);
  return {
    all: sorted,
    byId,
    primaries: ofKind('primary'),
    subcategoriesByPrimary,
    cuisines: ofKind('cuisine'),
    mealTypes: ofKind('meal_type'),
    dishTypes: ofKind('dish_type'),
    custom: offered.filter((c) => c.isCustom),
    retired: sorted.filter((c) => !c.isActive),
  };
}

/**
 * Which dimension a primary category shows as its quick pick in Create.
 * Data-driven: a primary with subcategories gets them; otherwise cuisine.
 * New primaries need no code change.
 */
export function quickPickFor(
  taxonomy: Taxonomy,
  primaryId: string | null,
): {
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

/** Same normalization as the database's slugify (for duplicate checks). */
export function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Most-used first (then the curated order), for "Common" in pickers. */
export function commonFirst(
  options: readonly Category[],
  usage: Readonly<Record<string, number>>,
  count: number,
): Category[] {
  return [...options]
    .filter((c) => c.slug !== 'other')
    .sort(
      (a, b) =>
        (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    )
    .slice(0, count);
}

/** Search by name, prefix matches first, alphabetical; includes custom labels. */
export function searchOptions(options: readonly Category[], query: string): Category[] {
  const q = normalizeLabel(query);
  const visible = options.filter((c) => c.slug !== 'other');
  if (!q) return [...visible].sort((a, b) => a.name.localeCompare(b.name));
  return visible
    .filter((c) => c.slug.includes(q) || normalizeLabel(c.name).includes(q))
    .sort((a, b) => Number(!c0(a, q)) - Number(!c0(b, q)) || a.name.localeCompare(b.name));
}
const c0 = (c: Category, q: string) => c.slug.startsWith(q);

/** Whether "Add …" should be offered: there's text and nothing already has that name. */
export function canAddCustom(options: readonly Category[], query: string): boolean {
  const q = normalizeLabel(query);
  return (
    query.trim().length >= 2 &&
    query.trim().length <= 30 &&
    q !== '' &&
    q !== 'other' &&
    !options.some((c) => c.slug === q)
  );
}
