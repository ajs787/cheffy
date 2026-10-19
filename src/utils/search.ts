/** Strips characters that have meaning in PostgREST filters or LIKE patterns. */
export function sanitizeSearch(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/[%,()*\\:"']/g, '')
    .replace(/^@/, '')
    .slice(0, 40);
}
