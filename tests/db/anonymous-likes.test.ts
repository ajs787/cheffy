/**
 * Anonymous likes: they count, but nobody else can see who gave them.
 * Runs the real migrations with RLS, as each role would.
 */
import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let cook: TestUser; // the creator
let ana: TestUser;
let ben: TestUser;
let postId: string;

const setMode = (mode: 'off' | 'beta' | 'all') =>
  db.admin(`update public.app_config set value = to_jsonb($1::text) where key = 'anonymous_takes.mode'`, [
    mode,
  ]);

const like = (user: TestUser, anonymous: boolean, post = postId) =>
  db.query(user.id, 'insert into public.likes (user_id, post_id, anonymous) values ($1, $2, $3)', [
    user.id,
    post,
    anonymous,
  ]);

const unlike = (user: TestUser, post = postId) =>
  db.query(user.id, 'delete from public.likes where user_id = $1 and post_id = $2', [user.id, post]);

const namedComment = async (user: TestUser, body: string) =>
  (
    await db.query<{ id: string }>(
      user.id,
      'insert into public.comments (post_id, author_id, body) values ($1, $2, $3) returning id',
      [postId, user.id, body],
    )
  )[0]!.id;

const likeComment = (user: TestUser, commentId: string, anonymous: boolean) =>
  db.query(user.id, 'insert into public.comment_likes (user_id, comment_id, anonymous) values ($1, $2, $3)', [
    user.id,
    commentId,
    anonymous,
  ]);

const notificationsFor = (user: TestUser) =>
  db.query<{ actor_id: string | null; type: string; comment_id: string | null }>(
    user.id,
    'select actor_id, type, comment_id from public.notifications order by created_at',
  );

const likeCount = async () =>
  (await db.admin<{ like_count: number }>('select like_count from public.posts where id = $1', [postId]))[0]!
    .like_count;

beforeEach(async () => {
  db = await TestDb.create();
  cook = await db.createUser('cook');
  ana = await db.createUser('ana');
  ben = await db.createUser('ben');
  postId = await db.createPost(cook.id);
  await setMode('all');
}, 60_000);

afterEach(async () => {
  await db.close();
});

describe('anonymous post likes', () => {
  it('count toward the total but are hidden from everyone but the liker', async () => {
    await like(ana, true);
    await like(ben, false);
    expect(await likeCount()).toBe(2);

    const seenBy = (u: TestUser) =>
      db.query<{ user_id: string }>(u.id, 'select user_id from public.likes where post_id = $1 order by user_id', [
        postId,
      ]);
    // The creator and other viewers only see the named like.
    expect((await seenBy(cook)).map((r) => r.user_id)).toEqual([ben.id]);
    // Ana sees her own like (and Ben's).
    expect((await seenBy(ana)).map((r) => r.user_id).sort()).toEqual([ana.id, ben.id].sort());
  });

  it('tells the liker their like is anonymous, and nobody else anything', async () => {
    await like(ana, true);
    const flag = (u: TestUser) =>
      db.query<{ liked: boolean; anon: boolean }>(
        u.id,
        `select public.viewer_has_liked(p) as liked, public.viewer_liked_anonymously(p) as anon
         from public.posts p where p.id = $1`,
        [postId],
      );
    expect((await flag(ana))[0]).toEqual({ liked: true, anon: true });
    expect((await flag(cook))[0]).toEqual({ liked: false, anon: false });
  });

  it('reports how many likes are anonymous, only to people who can see the post', async () => {
    await like(ana, true);
    await like(ben, true);
    const count = async (u: TestUser) =>
      (await db.query<{ n: number }>(u.id, 'select public.anonymous_like_count($1) as n', [postId]))[0]!.n;
    expect(await count(cook)).toBe(2);
    const hidden = await db.createPost(cook.id, { visibility: 'private' });
    await like(cook, true, hidden);
    const n = async (u: TestUser) =>
      (await db.query<{ n: number }>(u.id, 'select public.anonymous_like_count($1) as n', [hidden]))[0]!.n;
    expect(await n(cook)).toBe(1);
    expect(await n(ana)).toBe(0);
  });

  it('notifies the creator with no actor, and an unlike takes it back', async () => {
    await like(ana, true);
    const after = await notificationsFor(cook);
    expect(after).toEqual([{ actor_id: null, type: 'post_like', comment_id: null }]);
    const [push] = await db.admin<{ body: string }>(
      `select public.push_message(n) ->> 'body' as body from public.notifications n where n.recipient_id = $1`,
      [cook.id],
    );
    expect(push!.body).toMatch(/^A chef liked your /);
    expect(push!.body).not.toContain('ana');

    await unlike(ana);
    expect(await notificationsFor(cook)).toEqual([]);
    expect(await likeCount()).toBe(0);
  });

  it('a named unlike leaves an anonymous like notification alone', async () => {
    await like(ana, true);
    await like(ben, false);
    await unlike(ben);
    expect(await notificationsFor(cook)).toEqual([{ actor_id: null, type: 'post_like', comment_id: null }]);
  });

  it('follows the rollout switch', async () => {
    await setMode('off');
    await expectDbError(like(ana, true), /anonymous likes aren't available/);
    await like(ana, false); // named likes are unaffected
    await setMode('beta');
    await expectDbError(like(ben, true), /anonymous likes aren't available/);
    await db.admin('insert into public.anonymous_takes_testers (user_id) values ($1)', [ben.id]);
    await like(ben, true);
  });

  it('can’t be flipped to or from anonymous after the fact', async () => {
    await like(ana, true);
    await expectDbError(
      db.query(ana.id, 'update public.likes set anonymous = false where user_id = $1', [ana.id]),
      /permission denied/,
    );
  });

  it('are rate limited, and unliking doesn’t reset the limit', async () => {
    await db.admin(`insert into public.app_config (key, value) values ('anonymous_likes.hourly_limit', '2')
                    on conflict (key) do update set value = excluded.value`);
    await like(ana, true);
    await unlike(ana);
    await like(ana, true);
    await unlike(ana);
    await expectDbError(like(ana, true), /too many likes/);
    // Named likes aren't limited by it.
    await like(ana, false);
  });

  it('keep the private log out of reach', async () => {
    await like(ana, true);
    await expectDbError(db.query(ana.id, 'select * from public.anonymous_like_log'), /permission denied/);
  });

  it('don’t notify someone who blocked the liker', async () => {
    await db.admin('insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [cook.id, ana.id]);
    await like(ana, true).catch(() => undefined); // may be refused outright; either way no notification
    expect(await notificationsFor(cook)).toEqual([]);
  });
});

describe('anonymous comment likes', () => {
  it('count, stay hidden, and notify as "A chef" — even on an anonymous take', async () => {
    const commentId = await namedComment(cook, 'thanks all');
    await likeComment(ana, commentId, true);
    const rows = await db.query<{ user_id: string }>(
      ben.id,
      'select user_id from public.comment_likes where comment_id = $1',
      [commentId],
    );
    expect(rows).toEqual([]);
    const [c] = await db.admin<{ like_count: number }>('select like_count from public.comments where id = $1', [
      commentId,
    ]);
    expect(c!.like_count).toBe(1);
    expect(await notificationsFor(cook)).toEqual([{ actor_id: null, type: 'comment_like', comment_id: commentId }]);

    // An anonymous like on Ben's anonymous take reads "A chef", not Ben's own Chef number.
    const take = (
      await db.query<{ id: string }>(ben.id, 'select id from public.post_anonymous_take($1, $2)', [postId, 'hmm'])
    )[0]!.id;
    await likeComment(ana, take, true);
    const [push] = await db.admin<{ body: string }>(
      `select public.push_message(n) ->> 'body' as body from public.notifications n
       where n.recipient_id = $1 and n.type = 'comment_like'`,
      [ben.id],
    );
    expect(push!.body).toMatch(/^A chef liked your comment/);
  });

  it('an anonymous unlike takes the notification back', async () => {
    const commentId = await namedComment(cook, 'thanks all');
    await likeComment(ana, commentId, true);
    await db.query(ana.id, 'delete from public.comment_likes where user_id = $1 and comment_id = $2', [
      ana.id,
      commentId,
    ]);
    expect(await notificationsFor(cook)).toEqual([]);
  });
});
