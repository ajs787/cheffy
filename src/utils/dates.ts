const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses a YYYY-MM-DD date as a local calendar date (no timezone shift). */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Formats a Date as a local YYYY-MM-DD string. */
export function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatCalendarDate(value: string | Date, now: Date = new Date()): string {
  const date =
    typeof value === 'string' ? (value.length === 10 ? parseLocalDate(value) : new Date(value)) : value;
  const base = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base}, ${date.getFullYear()}`;
}

/** Compact relative time for feeds: "now", "5m", "3h", "2d", then a date. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatCalendarDate(then, now);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Diary-entry date label, e.g. "Sun · 14 Sep" (year added when not this year). */
export function formatEntryDate(madeOn: string, now: Date = new Date()): string {
  const date = parseLocalDate(madeOn);
  const base = `${WEEKDAYS[date.getDay()]} · ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

const memberSinceFormat = new Intl.DateTimeFormat('en-US', {
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
});

/** "10/19/2026": the account's creation date, month/day/year. */
export function formatMemberSince(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : memberSinceFormat.format(date);
}
