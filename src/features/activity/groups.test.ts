import type { ActivityItem } from './api';
import { groupActivity } from './groups';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

// Local times on Thu 23 Oct 2026, 15:00.
const now = new Date(2026, 9, 23, 15, 0);
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour, 0).toISOString();
let n = 0;
const item = (type: ActivityItem['type'], when: string, read = true): ActivityItem =>
  ({
    id: `n${++n}`,
    type,
    at: when,
    read,
    actor: {} as never,
    post: null,
    commentId: null,
    commentBody: null,
  }) as ActivityItem;

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
    expect(groups.map((g) => g.section)).toEqual(['Today', 'Yesterday', 'Last 7 days', 'Earlier']);
    expect(groups[0]!.items.map((i) => i.type)).toEqual(['comment', 'post_like']);
    expect(groups[0]!.items[0]!.read).toBe(false);
    expect(groups[1]!.items).toHaveLength(2);
    expect(groups[2]!.items).toHaveLength(2); // the 19th and the 16th
    expect(groups[3]!.items).toHaveLength(1); // the 15th
  });

  it('features recent collaborations and accepted requests once, at the top', () => {
    const invite = item('collab_invite', at(23, 10));
    const accepted = item('follow_accepted', at(20));
    const oldCollab = item('collab_accepted', at(1));
    const groups = groupActivity([item('post_like', at(23, 11)), invite, accepted, oldCollab], now);
    expect(groups[0]!.section).toBe('Featured');
    expect(groups[0]!.items.map((i) => i.id)).toEqual([invite.id, accepted.id]);
    const rest = groups.slice(1).flatMap((g) => g.items.map((i) => i.id));
    expect(rest).not.toContain(invite.id);
    expect(rest).not.toContain(accepted.id);
    expect(rest).toContain(oldCollab.id); // too old to feature, still listed under Earlier
  });

  it('leaves follow requests to their own row', () => {
    expect(groupActivity([item('follow_request', at(23))], now)).toEqual([]);
  });
});
