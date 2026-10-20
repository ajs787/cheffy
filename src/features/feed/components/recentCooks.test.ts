import type { Post } from '@/types/models';

import { recentCooks } from './CookingLately';

jest.mock('@/features/discover/hooks', () => ({ useDiscoverSection: jest.fn() }));

const post = (authorId: string) =>
  ({ author: { id: authorId, username: authorId, displayName: authorId, avatarUrl: null } }) as Post;

describe('recentCooks', () => {
  it('lists each author once, newest first', () => {
    expect(recentCooks([post('a'), post('b'), post('a'), post('c')]).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});
