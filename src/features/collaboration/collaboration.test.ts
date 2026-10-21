import { mapCollaboration } from '@/features/posts/mappers';
import { madeByNames } from '@/types/models';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const user = (id: string) => ({ id, username: id, display_name: id.toUpperCase(), avatar_path: null });

describe('mapCollaboration', () => {
  it('splits accepted co-creators (with their own ratings) from pending invitees', () => {
    const { coCreators, pendingInvitees } = mapCollaboration(
      [
        { status: 'accepted', user: user('sophie') },
        { status: 'pending', user: user('jun') },
        { status: 'declined', user: user('max') },
        { status: 'accepted', user: null },
      ],
      [{ user_id: 'sophie', rating: '7.5', review: 'too sweet' }],
    );
    expect(coCreators).toEqual([
      {
        profile: expect.objectContaining({ id: 'sophie', displayName: 'SOPHIE' }),
        rating: 7.5,
        review: 'too sweet',
      },
    ]);
    expect(pendingInvitees.map((p) => p.id)).toEqual(['jun']);
  });

  it('marks co-creators who have not rated yet', () => {
    expect(mapCollaboration([{ status: 'accepted', user: user('pal') }], []).coCreators[0]).toMatchObject({
      rating: null,
      review: '',
    });
    expect(mapCollaboration(undefined, undefined)).toEqual({ coCreators: [], pendingInvitees: [] });
  });
});

describe('madeByNames', () => {
  it('reads naturally', () => {
    expect(madeByNames(['Audrey'])).toBe('Audrey');
    expect(madeByNames(['Audrey', 'Sophie'])).toBe('Audrey and Sophie');
    expect(madeByNames(['Audrey', 'Sophie', 'Jun'])).toBe('Audrey, Sophie and Jun');
  });
});
