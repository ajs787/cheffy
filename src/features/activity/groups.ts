import type { ActivityItem } from './api';

export const ACTIVITY_SECTIONS = ['Today', 'Yesterday', 'Last 7 Days', 'Earlier'] as const;
export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number];

const DAY_MS = 86_400_000;
const LAST_DAYS = 7;

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A calendar day as a whole number (days since 1970-01-01), so two days can
 * be subtracted without daylight-saving surprises. With no time zone it uses
 * the phone's own; the zone argument exists so tests can pin one.
 */
export function dayNumber(date: Date, timeZone?: string): number {
  if (!timeZone) return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
    formatters.set(timeZone, f);
  }
  const part = (type: string) => Number(f.formatToParts(date).find((p) => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day')) / DAY_MS;
}

/** Which section a notification belongs to, by calendar days before `now`. */
export function sectionFor(at: Date, now: Date, timeZone?: string): ActivitySection {
  const daysAgo = dayNumber(now, timeZone) - dayNumber(at, timeZone);
  if (daysAgo <= 0) return 'Today'; // includes a slightly-ahead clock
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo <= LAST_DAYS) return 'Last 7 Days';
  return 'Earlier';
}

/**
 * Puts every notification, of every type, into exactly one date section —
 * Today, Yesterday, Last 7 Days (2–7 calendar days ago), Earlier — newest
 * first, by the phone's local calendar day. A repeated id is listed once.
 * Empty sections are left out.
 */
export function groupActivity(
  items: readonly ActivityItem[],
  now: Date = new Date(),
  timeZone?: string,
): { section: ActivitySection; items: ActivityItem[] }[] {
  const seen = new Set<string>();
  const sorted = items
    .filter((i) => !seen.has(i.id) && seen.add(i.id))
    // An unreadable timestamp sorts last, under Earlier, rather than vanishing.
    .map((item) => ({ item, t: Date.parse(item.at) || 0 }))
    .sort((a, b) => b.t - a.t || b.item.id.localeCompare(a.item.id));

  const buckets = new Map<ActivitySection, ActivityItem[]>(ACTIVITY_SECTIONS.map((s) => [s, []]));
  for (const { item, t } of sorted) buckets.get(sectionFor(new Date(t), now, timeZone))!.push(item);

  return ACTIVITY_SECTIONS.map((section) => ({ section, items: buckets.get(section)! })).filter(
    (g) => g.items.length > 0,
  );
}
