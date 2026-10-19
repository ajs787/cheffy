/**
 * Typed boundary for Supabase reads. The client is untyped (no generated
 * Database types yet — see ARCHITECTURE.md), so each feature declares the
 * row shape its select string returns and asserts it here, in one place.
 */
type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;

export async function fetchRows<T>(query: QueryResult): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function fetchOne<T>(query: QueryResult): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}

export async function fetchMaybe<T>(query: QueryResult): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? null) as T | null;
}
