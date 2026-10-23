/** Budget Eats prices: typed as dollars, stored as whole cents (USD). */
export const MAX_COST_CENTS = 100_000;

/** "3.2" / "$3.20" / "3" → 320; '' → null; anything else → NaN. */
export function parseDollars(input: string): number | null {
  const v = input.trim().replace(/^\$/, '').trim();
  if (v === '') return null;
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(v)) return Number.NaN;
  return Math.round(Number(v) * 100);
}

/** 320 → "$3.20"; whole dollars keep the cents for a consistent look. */
export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "Budget Eats · ~$3.20 / serving" (the ~ marks it as an estimate). */
export function budgetLabel(cents: number | null): string {
  return cents === null ? 'Budget Eats' : `Budget Eats · ~${formatDollars(cents)} / serving`;
}
