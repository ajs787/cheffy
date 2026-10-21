import { badgeLabel } from './components/ActivityBell';
import { activityTarget, describe as describeItem, mapNotification } from './api';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const actorRow = {
  id: 'u',
  username: 'ana',
  display_name: 'Ana',
  avatar_path: null,
  is_private: false,
  viewer_is_following: false,
  viewer_has_requested: false,
};
const post = {
  id: 'p',
  title: 'Iced Matcha',
  images: [
    { thumb_path: 'b.jpg', position: 1 },
    { thumb_path: 'a.jpg', position: 0 },
  ],
};
const row = (type: Parameters<typeof describeItem>[0]['type'], extra = {}) => ({
  id: 'n',
  type,
  created_at: '2026-10-20T10:00:00Z',
  read_at: null,
  comment_id: null,
  actor: actorRow,
  post: null,
  comment: null,
  ...extra,
});

describe('notifications', () => {
  it('map rows, picking the cover and read state', () => {
    const item = mapNotification(row('post_like', { post, read_at: '2026-10-20T11:00:00Z' }))!;
    expect(item).toMatchObject({ type: 'post_like', read: true, post: { id: 'p', thumbPath: 'a.jpg' } });
    expect(item.actor).toMatchObject({ username: 'ana', isPrivate: false });
  });

  it('drop rows whose actor or post is no longer visible', () => {
    expect(mapNotification(row('follow', { actor: null }))).toBeNull();
    expect(mapNotification(row('comment'))).toBeNull();
    expect(mapNotification(row('follow'))).not.toBeNull();
  });

  it('read as sentences', () => {
    const p = { id: 'p', title: 'Iced Matcha', thumbPath: null, thumbUrl: null };
    expect(describeItem({ type: 'follow_request', post: null, commentBody: null })).toBe(
      'asked to follow you',
    );
    expect(describeItem({ type: 'post_like', post: p, commentBody: null })).toBe('liked your Iced Matcha');
    expect(describeItem({ type: 'comment_reply', post: p, commentBody: 'yes' })).toBe(
      'replied to you on Iced Matcha',
    );
    expect(describeItem({ type: 'comment_like', post: p, commentBody: 'yum' })).toBe(
      'liked your comment on Iced Matcha',
    );
  });

  it('open the profile or the post', () => {
    const actor = mapNotification(row('follow'))!.actor;
    expect(activityTarget({ type: 'follow', post: null, actor })).toEqual({
      pathname: '/user/[id]',
      params: { id: 'u' },
    });
    const p = { id: 'p', title: 't', thumbPath: null, thumbUrl: null };
    expect(activityTarget({ type: 'comment', post: p, actor })).toEqual({
      pathname: '/post/[id]',
      params: { id: 'p', focus: 'comments' },
    });
  });

  it('cap the badge', () => {
    expect(badgeLabel(3)).toBe('3');
    expect(badgeLabel(12)).toBe('9+');
  });
});
