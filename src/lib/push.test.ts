import { pushCommentId, pushPath } from './push';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

describe('pushPath', () => {
  const id = '5bcefbe6-4806-4ae3-b7ee-43302651f137';

  it('accepts post and profile paths', () => {
    expect(pushPath({ path: `/post/${id}` })).toBe(`/post/${id}`);
    expect(pushPath({ path: `/user/${id}` })).toBe(`/user/${id}`);
  });

  it('ignores anything else a payload might carry', () => {
    expect(pushPath({ path: '/settings' })).toBeNull();
    expect(pushPath({ path: 'https://evil.example' })).toBeNull();
    expect(pushPath({ path: `/post/${id}/../../x` })).toBeNull();
    expect(pushPath(null)).toBeNull();
  });
});

describe('pushCommentId', () => {
  it('accepts only a comment uuid', () => {
    const id = '3f2a8c1e-0b7d-4c5e-9a1f-2b3c4d5e6f70';
    expect(pushCommentId({ commentId: id })).toBe(id);
    expect(pushCommentId({ commentId: '../../x' })).toBeNull();
    expect(pushCommentId({})).toBeNull();
    expect(pushCommentId(null)).toBeNull();
  });
});
