import type { ActivityItem } from '@/features/activity/api';

import { useNotificationBannerStore } from './notificationBanner';

const item = (id: string) => ({ id }) as ActivityItem;
const store = () => useNotificationBannerStore.getState();

beforeEach(() => {
  useNotificationBannerStore.setState({ current: null, queue: [], seen: new Set() });
});

describe('notification banners', () => {
  it('shows one at a time and queues the rest in order', () => {
    store().show(item('a'));
    store().show(item('b'));
    store().show(item('c'));
    expect(store().current?.id).toBe('a');
    expect(store().queue.map((q) => q.id)).toEqual(['b', 'c']);

    store().dismiss('a');
    expect(store().current).toBeNull();
    store().advance();
    expect(store().current?.id).toBe('b');
    expect(store().queue.map((q) => q.id)).toEqual(['c']);
  });

  it('never shows the same notification twice', () => {
    store().show(item('a'));
    store().dismiss('a');
    store().show(item('a'));
    expect(store().current).toBeNull();
  });

  it('keeps arrival order while the next banner is on its way', () => {
    store().show(item('a'));
    store().show(item('b'));
    store().dismiss('a');
    store().show(item('c'));
    store().advance();
    expect(store().current?.id).toBe('b');
  });

  it('keeps at most three waiting', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) store().show(item(id));
    expect(store().queue.map((q) => q.id)).toEqual(['c', 'd', 'e']);
  });
});
