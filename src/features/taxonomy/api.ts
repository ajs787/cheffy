import { supabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/errors';

import { buildTaxonomy, mapCategory, type CategoryRow } from './taxonomy';

export async function fetchTaxonomy() {
  const rows = unwrap(
    await supabase
      .from('categories')
      .select('id, kind, parent_id, slug, name, sort_order')
      .eq('is_active', true)
      .order('sort_order'),
  ) as CategoryRow[];
  return buildTaxonomy(rows.map(mapCategory));
}
