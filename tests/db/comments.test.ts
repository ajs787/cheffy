import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let cook: TestUser;
let ana: TestUser;
let ben: TestUser;
let postId: string;

const comment = async (
  user: TestUser,
  body: string,
  parentId: string | null = null,
  replyTo: string | null = null,
) =>
  (
    await db.query<{ id: string }>(
      user.id,
      `insert into public.comments (post_id, author_id, body, parent_id, reply_to_user_id)
       values ($1, $2, $3, $4, $5) returning id`,
      [postId, user.id, body, parentId, replyTo],
    )
  )[0]!.id;
const row = async (id: string) =>
  (
    await db.admin<{
      parent_id: string | null;
      reply_count: number;
      like_count: number;
      reply_to_user_id: string | null;
    }>('select parent_id, reply_count, like_count, reply_to_user_id from public.comments where id = $1', [id])
  )[0]!;
const likeComment = (user: TestUser, id: string) =>
  db.query(user.id, 'insert into public.comment_likes (user_id, comment_id) values ($1, $2)', [user.id, id]);

beforeAll(async () => {
  db = await TestDb.create();
  cook = await db.createUser('cook');
  ana = await db.createUser('ana');
  ben = await db.createUser('ben');
  postId = await db.createPost(cook.id);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('replies', () => {
  it('attach to a comment, count, and name who they answer', async () => {
    const top = await comment(ana, 'How long did you whisk?');
    const reply = await comment(cook, 'About a minute!', top, ana.id);
    expect(await row(reply)).toMatchObject({ parent_id: top, reply_to_user_id: ana.id });
    expect((await row(top)).reply_count).toBe(1);
    const [post] = await db.admin<{ comment_count: number }>(
      'select comment_count from public.posts where id = $1',
      [postId],
    );
    expect(post!.comment_count).toBe(2);
  });

  it('never nest deeper than one level', async () => {
    const top = await comment(ana, 'Recipe?');
    const reply = await comment(cook, 'Linked in the post', top, ana.id);
    const replyToReply = await comment(ben, 'Thanks!', reply, cook.id);
    expect((await row(replyToReply)).parent_id).toBe(top);
    expect((await row(top)).reply_count).toBe(2);
  });

  it('must stay on the same post', async () => {
    const other = await db.createPost(cook.id);
    const top = await comment(ana, 'Nice');
    await expectDbError(
      db.query(
        ben.id,
        'insert into public.comments (post_id, author_id, body, parent_id) values ($1, $2, $3, $4)',
        [other, ben.id, 'wrong thread', top],
      ),
      /same post/,
    );
  });

  it('are removed with their comment, keeping counts right', async () => {
    const top = await comment(ana, 'Delete me');
    await comment(ben, 'reply 1', top);
    await comment(cook, 'reply 2', top);
    const [before] = await db.admin<{ comment_count: number }>(
      'select comment_count from public.posts where id = $1',
      [postId],
    );
    await db.query(ana.id, 'delete from public.comments where id = $1', [top]);
    const [after] = await db.admin<{ comment_count: number }>(
      'select comment_count from public.posts where id = $1',
      [postId],
    );
    expect(before!.comment_count - after!.comment_count).toBe(3);
  });

  it('let authors delete their own replies', async () => {
    const top = await comment(ana, 'Top');
    const reply = await comment(ben, 'my reply', top);
    await db.query(ben.id, 'delete from public.comments where id = $1', [reply]);
    expect((await row(top)).reply_count).toBe(0);
  });
});

describe('comment likes', () => {
  it('count once per person and can be undone', async () => {
    const id = await comment(ana, 'Gorgeous crumb');
    await likeComment(ben, id);
    await likeComment(cook, id);
    await expectDbError(likeComment(ben, id), /comment_likes_pkey/);
    expect((await row(id)).like_count).toBe(2);
    const [liked] = await db.query<{ v: boolean }>(
      ben.id,
      'select public.viewer_has_liked_comment(c) as v from public.comments c where id = $1',
      [id],
    );
    expect(liked!.v).toBe(true);
    await db.query(ben.id, 'delete from public.comment_likes where comment_id = $1 and user_id = $2', [
      id,
      ben.id,
    ]);
    expect((await row(id)).like_count).toBe(1);
  });

  it('cannot be forged for someone else or written into counts', async () => {
    const id = await comment(ana, 'Hmm');
    await expectDbError(
      db.query(ben.id, 'insert into public.comment_likes (user_id, comment_id) values ($1, $2)', [
        ana.id,
        id,
      ]),
      /row-level security/,
    );
    await expectDbError(
      db.query(
        ben.id,
        'insert into public.comments (post_id, author_id, body, like_count) values ($1, $2, $3, 999)',
        [postId, ben.id, 'cheat'],
      ),
      /permission denied/,
    );
  });

  it('follow comment visibility', async () => {
    const hidden = await db.createPost(cook.id, { visibility: 'private' });
    const [{ id }] = await db.query<{ id: string }>(
      cook.id,
      `insert into public.comments (post_id, author_id, body) values ($1, $2, 'note to self') returning id`,
      [hidden, cook.id],
    );
    await expectDbError(likeComment(ana, id), /row-level security/);
  });
});
