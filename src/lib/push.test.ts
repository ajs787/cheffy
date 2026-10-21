import { pushPath } from './push';

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
