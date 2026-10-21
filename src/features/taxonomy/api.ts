import { supabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/errors';

import { buildTaxonomy, mapCategory, type CategoryRow } from './taxonomy';

export async function fetchTaxonomy() {
  const rows = unwrap(
    await supabase
      .from('categories')
      .select('id, kind, parent_id, slug, name, sort_order, is_custom')
      .eq('is_active', true)
      .order('sort_order'),
  ) as CategoryRow[];
  return buildTaxonomy(rows.map(mapCategory));
}

export async function fetchClassificationUsage(kind: string): Promise<Record<string, number>> {
  const rows = unwrap(await supabase.rpc('classification_usage', { p_kind: kind })) as
    { category_id: string; uses: number }[] | null;
  return Object.fromEntries((rows ?? []).map((r) => [r.category_id, Number(r.uses)]));
}
