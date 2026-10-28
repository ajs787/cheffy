import type { ActivityItem, NotificationType } from './api';
import { groupActivity, sectionFor } from './groups';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

// Local times on Thu 23 Oct 2026, 15:00.
const now = new Date(2026, 9, 23, 15, 0);
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
let n = 0;
const item = (type: NotificationType, when: string, read = true, id = `n${++n}`): ActivityItem =>
  ({
    id,
    type,
    at: when,
    read,
    actor: {} as never,
    post: null,
    commentId: null,
    commentBody: null,
  }) as ActivityItem;

const ALL_TYPES: NotificationType[] = [
  'follow',
  'follow_request',
  'follow_accepted',
  'post_like',
  'comment',
  'comment_reply',
  'comment_like',
  'collab_invite',
  'collab_accepted',
];

const ids = (groups: ReturnType<typeof groupActivity>) => groups.flatMap((g) => g.items.map((i) => i.id));

describe('groupActivity', () => {
  it('sorts into local-day sections, newest first, with no empty sections', () => {
    const items = [
      item('post_like', at(23, 9)),
      item('comment', at(23, 14), false),
      item('follow', at(22, 23)),
      item('post_like', at(22, 0)),
      item('comment', at(19)),
      item('post_like', at(16, 1)),
      item('post_like', at(15, 23)),
    ];
    const groups = groupActivity(items, now);
    expect(groups.map((g) => g.section)).toEqual(['Today', 'Yesterday', 'Last 7 Days', 'Earlier']);
    expect(groups[0]!.items.map((i) => i.type)).toEqual(['comment', 'post_like']);
    expect(groups[0]!.items[0]!.read).toBe(false);
    expect(groups[1]!.items).toHaveLength(2);
    expect(groups[2]!.items).toHaveLength(2); // the 19th and the 16th
    expect(groups[3]!.items).toHaveLength(1); // the 15th
  });

  it('has no Featured section: collaborations and accepted requests sit in their date section', () => {
    const invite = item('collab_invite', at(23, 10));
    const accepted = item('follow_accepted', at(20));
    const like = item('post_like', at(23, 11));
    const groups = groupActivity([invite, accepted, like], now);
    expect(groups.map((g) => g.section)).toEqual(['Today', 'Last 7 Days']);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([like.id, invite.id]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual([accepted.id]);
  });

  it('lists every type exactly once, follow requests and invitations included', () => {
    const items = ALL_TYPES.flatMap((type, k) => [
      item(type, at(23, k)),
      item(type, at(22, k)),
      item(type, at(18, k)),
      item(type, at(1, k)),
    ]);
    const listed = ids(groupActivity(items, now));
    expect(listed).toHaveLength(items.length);
    expect(new Set(listed)).toEqual(new Set(items.map((i) => i.id)));
  });

  it('lists a repeated notification (same id) once', () => {
    const a = item('comment', at(23, 9), false, 'dup');
    const b = item('comment', at(23, 9), true, 'dup');
    expect(ids(groupActivity([a, b, item('follow', at(23, 8))], now)).filter((id) => id === 'dup')).toEqual([
      'dup',
    ]);
  });

  it('is newest first within and across sections, whatever the input order', () => {
    const items = [at(20, 8), at(23, 1), at(10), at(22, 5), at(23, 14), at(20, 22), at(22, 18), at(2)].map(
      (when) => item('post_like', when),
    );
    const listed = groupActivity(items, now).flatMap((g) => g.items.map((i) => Date.parse(i.at)));
    expect(listed).toEqual([...listed].sort((x, y) => y - x));
  });

  it('breaks ties on the same timestamp by id, so the order is stable', () => {
    const when = at(23, 9);
    const groups = groupActivity([item('post_like', when, true, 'a'), item('comment', when, true, 'b')], now);
    expect(ids(groups)).toEqual(['b', 'a']);
  });

  it('splits today and yesterday exactly at local midnight', () => {
    const groups = groupActivity(
      [item('post_like', at(23, 0, 0), true, 'midnight'), item('post_like', at(22, 23, 59), true, 'before')],
      new Date(2026, 9, 23, 0, 0, 30),
    );
    expect(groups).toEqual([
      { section: 'Today', items: [expect.objectContaining({ id: 'midnight' })] },
      { section: 'Yesterday', items: [expect.objectContaining({ id: 'before' })] },
    ]);
  });

  it('keeps 7 calendar days ago in Last 7 Days and moves 8 days ago to Earlier', () => {
    expect(sectionFor(new Date(2026, 9, 21, 23, 59), now)).toBe('Last 7 Days'); // 2 days ago
    expect(sectionFor(new Date(2026, 9, 16, 0, 0), now)).toBe('Last 7 Days'); // 7 days ago, first minute
    expect(sectionFor(new Date(2026, 9, 15, 23, 59), now)).toBe('Earlier'); // 8 days ago, last minute
  });

  it('puts a timestamp slightly in the future under Today', () => {
    expect(sectionFor(new Date(now.getTime() + 60_000), now)).toBe('Today');
  });

  it('puts an unreadable timestamp under Earlier instead of dropping it', () => {
    const groups = groupActivity([item('follow', 'not a date', true, 'bad'), item('follow', at(23))], now);
    expect(groups.at(-1)).toEqual({ section: 'Earlier', items: [expect.objectContaining({ id: 'bad' })] });
  });

  it('groups by the given time zone, not UTC', () => {
    // 23 Oct 2026 03:00 UTC is still the evening of the 22nd in Los Angeles,
    // and already midday on the 23rd in Tokyo.
    const event = item('comment', '2026-10-23T03:00:00Z', true, 'tz');
    const instant = new Date('2026-10-23T14:00:00Z'); // 07:00 on the 23rd in LA, 23:00 in Tokyo
    expect(groupActivity([event], instant, 'America/Los_Angeles')[0]!.section).toBe('Yesterday');
    expect(groupActivity([event], instant, 'Asia/Tokyo')[0]!.section).toBe('Today');
  });

  it('counts calendar days across a daylight-saving change', () => {
    // New York falls back on Sun 1 Nov 2026; that day has 25 hours.
    const ny = 'America/New_York';
    const monday = new Date('2026-11-02T05:30:00Z'); // 00:30 Mon in New York
    expect(sectionFor(new Date('2026-11-02T04:59:00Z'), monday, ny)).toBe('Yesterday'); // 23:59 Sun
    expect(sectionFor(new Date('2026-11-01T04:00:00Z'), monday, ny)).toBe('Yesterday'); // 00:00 Sun
    expect(sectionFor(new Date('2026-11-01T03:59:00Z'), monday, ny)).toBe('Last 7 Days'); // 23:59 Sat
  });
});
