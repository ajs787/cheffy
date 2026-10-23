import type { ActivityItem, NotificationType } from './api';

export type ActivitySection = 'Featured' | 'Today' | 'Yesterday' | 'Last 7 days' | 'Earlier';

/** Types worth pinning to the top: collaborations and accepted follow requests. */
export const FEATURED_TYPES: readonly NotificationType[] = [
  'collab_invite',
  'collab_accepted',
  'follow_accepted',
];
const FEATURED_DAYS = 7;
const FEATURED_MAX = 5;

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Splits activity into sections by the phone's local calendar day, newest
 * first within each. Featured items (recent collaborations and accepted
 * follow requests) appear once, at the top, and not again below. Follow
 * requests are left out: they have their own row above the list.
 */
export function groupActivity(
  items: readonly ActivityItem[],
  now: Date = new Date(),
): { section: ActivitySection; items: ActivityItem[] }[] {
  const today = startOfLocalDay(now).getTime();
  const yesterday = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)).getTime();
  const weekStart = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)).getTime();
  const featuredSince = now.getTime() - FEATURED_DAYS * 86_400_000;

  const sorted = items
    .filter((i) => i.type !== 'follow_request')
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));

  const featured = sorted
    .filter((i) => FEATURED_TYPES.includes(i.type) && new Date(i.at).getTime() >= featuredSince)
    .slice(0, FEATURED_MAX);
  const featuredIds = new Set(featured.map((i) => i.id));

  const buckets: Record<Exclude<ActivitySection, 'Featured'>, ActivityItem[]> = {
    Today: [],
    Yesterday: [],
    'Last 7 days': [],
    Earlier: [],
  };
  for (const item of sorted) {
    if (featuredIds.has(item.id)) continue;
    const t = new Date(item.at).getTime();
    if (t >= today) buckets.Today.push(item);
    else if (t >= yesterday) buckets.Yesterday.push(item);
    else if (t >= weekStart) buckets['Last 7 days'].push(item);
    else buckets.Earlier.push(item);
  }

  return [
    { section: 'Featured' as const, items: featured },
    ...(Object.keys(buckets) as (keyof typeof buckets)[]).map((section) => ({
      section,
      items: buckets[section],
    })),
  ].filter((g) => g.items.length > 0);
}
