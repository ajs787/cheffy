import { mapTopComments } from './mappers';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const author = (username: string) => ({ id: username, username, display_name: username, avatar_path: null });

describe('feed comment preview', () => {
  it('keeps the first two top-level comments and skips replies and hidden authors', () => {
    const preview = mapTopComments([
      { id: 'r1', body: 'a reply', like_count: 9, parent_id: 'c1', author: author('ann') },
      { id: 'c1', body: 'so good', like_count: 5, parent_id: null, author: author('bea') },
      { id: 'c2', body: 'hidden', like_count: 4, parent_id: null, author: null },
      { id: 'c3', body: 'recipe?', like_count: 1, parent_id: null, author: author('cal') },
      { id: 'c4', body: 'yum', like_count: 0, parent_id: null, author: author('dee') },
    ]);
    expect(preview.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(preview[0]).toMatchObject({ body: 'so good', likeCount: 5, author: { username: 'bea' } });
  });

  it('is empty when there are no comments', () => {
    expect(mapTopComments(undefined)).toEqual([]);
  });
});
