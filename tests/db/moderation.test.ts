import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let mod: TestUser;
let author: TestUser;
let viewer: TestUser;

const status = async (postId: string) =>
  (await db.admin<{ status: string }>('select status from public.posts where id = $1', [postId]))[0]!.status;
const sees = async (user: TestUser, postId: string) =>
  (await db.query(user.id, 'select 1 from public.posts where id = $1', [postId])).length === 1;
const report = (user: TestUser, type: 'post' | 'comment' | 'user', id: string) =>
  db.query(
    user.id,
    `insert into public.reports (reporter_id, target_type, target_post_id, target_comment_id, target_user_id, reason)
     values ($1, $2, $3, $4, $5, 'inappropriate')`,
    [user.id, type, type === 'post' ? id : null, type === 'comment' ? id : null, type === 'user' ? id : null],
  );
const moderate = (user: TestUser, type: string, id: string, action: string, note = '') =>
  db.query(user.id, 'select public.moderate($1, $2::uuid, $3, $4)', [type, id, action, note]);
const comment = async (user: TestUser, postId: string, body = 'Looks great') =>
  (
    await db.query<{ id: string }>(
      user.id,
      'insert into public.comments (post_id, author_id, body) values ($1, $2, $3) returning id',
      [postId, user.id, body],
    )
  )[0]!.id;

beforeAll(async () => {
  db = await TestDb.create();
  mod = await db.createUser('moddy');
  author = await db.createUser('author');
  viewer = await db.createUser('viewer');
  await db.admin('insert into public.moderators (user_id) values ($1)', [mod.id]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('moderator access', () => {
  it('only moderators can read the queue or act', async () => {
    const postId = await db.createPost(author.id);
    await expectDbError(db.query(viewer.id, 'select * from public.moderation_queue()'), /moderators only/);
    await expectDbError(moderate(viewer, 'post', postId, 'remove'), /moderators only/);
    await expectDbError(db.query(viewer.id, 'select * from public.moderators'), /permission denied/);
    await expectDbError(db.query(viewer.id, 'select * from public.moderation_actions'), /permission denied/);
    await expectDbError(
      db.query(viewer.id, 'insert into public.moderators (user_id) values ($1)', [viewer.id]),
      /permission denied/,
    );
    expect((await db.query<{ m: boolean }>(viewer.id, 'select public.is_moderator() as m'))[0]!.m).toBe(
      false,
    );
    expect((await db.query<{ m: boolean }>(mod.id, 'select public.is_moderator() as m'))[0]!.m).toBe(true);
  });

  it('rejects actions that do not fit the target', async () => {
    await expectDbError(moderate(mod, 'post', author.id, 'suspend'), /invalid moderation action/);
    await expectDbError(moderate(mod, 'user', author.id, 'remove'), /invalid moderation action/);
  });
});

describe('posts', () => {
  it('a removed post disappears for everyone but its author, everywhere', async () => {
    const postId = await db.createPost(author.id, { title: 'Questionable stew' });
    await db.follow(viewer.id, author.id);
    await report(viewer, 'post', postId);
    const queue = await db.query<{ target_id: string; preview: string; owner_username: string }>(
      mod.id,
      'select * from public.moderation_queue()',
    );
    expect(queue.find((q) => q.target_id === postId)).toMatchObject({
      preview: 'Questionable stew',
      owner_username: 'author',
    });

    await moderate(mod, 'post', postId, 'remove', 'Not food');
    expect(await status(postId)).toBe('removed');
    expect(await sees(viewer, postId)).toBe(false);
    expect(await sees(author, postId)).toBe(true);
    const feed = await db.query<{ id: string }>(viewer.id, 'select id from public.feed_posts()');
    expect(feed.map((r) => r.id)).not.toContain(postId);
    // Reports are closed and the action is logged.
    expect(await db.admin('select status from public.reports where target_post_id = $1', [postId])).toEqual([
      { status: 'actioned' },
    ]);
    expect(
      await db.admin('select action, note from public.moderation_actions where target_id = $1', [postId]),
    ).toEqual([{ action: 'remove', note: 'Not food' }]);
  });

  it('authors cannot republish, fake removal, or clear the reason', async () => {
    const postId = await db.createPost(author.id);
    await moderate(mod, 'post', postId, 'remove');
    await expectDbError(
      db.query(author.id, `update public.posts set status = 'published' where id = $1`, [postId]),
      /removed by Cheffy/,
    );
    const other = await db.createPost(author.id);
    await expectDbError(
      db.query(author.id, `update public.posts set status = 'removed' where id = $1`, [other]),
      /removed by Cheffy/,
    );
    await expectDbError(
      db.query(author.id, `update public.posts set removed_reason = null where id = $1`, [postId]),
      /permission denied/,
    );
  });

  it('restore brings the post back in its original place', async () => {
    const postId = await db.createPost(author.id);
    const before = (
      await db.admin<{ published_at: Date }>('select published_at from public.posts where id = $1', [postId])
    )[0]!.published_at;
    await moderate(mod, 'post', postId, 'remove');
    await moderate(mod, 'post', postId, 'restore');
    expect(await status(postId)).toBe('published');
    const after = (
      await db.admin<{ published_at: Date }>('select published_at from public.posts where id = $1', [postId])
    )[0]!.published_at;
    expect(after.toISOString()).toBe(before.toISOString());
    expect(await sees(viewer, postId)).toBe(true);
  });

  it('three separate reporters hide a post until review; one reporter cannot', async () => {
    const postId = await db.createPost(author.id);
    const others = [await db.createUser('rep_a'), await db.createUser('rep_b')];
    await report(viewer, 'post', postId);
    await report(viewer, 'post', postId); // same person twice still counts once
    await report(others[0]!, 'post', postId);
    expect(await status(postId)).toBe('published');
    await report(others[1]!, 'post', postId);
    expect(await status(postId)).toBe('removed');
    expect(
      await db.admin(`select action from public.moderation_actions where target_id = $1`, [postId]),
    ).toEqual([{ action: 'auto_hide' }]);
    // A moderator can review and restore it.
    await moderate(mod, 'post', postId, 'restore');
    expect(await status(postId)).toBe('published');
  });
});

describe('comments', () => {
  it('removed comments are hidden from others and locked for their author', async () => {
    const postId = await db.createPost(author.id);
    const commentId = await comment(viewer, postId);
    await moderate(mod, 'comment', commentId, 'remove');
    expect(
      await db.query(author.id, 'select 1 from public.comments where id = $1', [commentId]),
    ).toHaveLength(0);
    expect(
      await db.query(viewer.id, 'select 1 from public.comments where id = $1', [commentId]),
    ).toHaveLength(1);
    await db
      .query(viewer.id, `update public.comments set body = 'edited', hidden_at = null where id = $1`, [
        commentId,
      ])
      .catch(() => undefined);
    expect(
      (
        await db.admin<{ hidden_at: Date | null }>('select hidden_at from public.comments where id = $1', [
          commentId,
        ])
      )[0]!.hidden_at,
    ).not.toBeNull();
    await moderate(mod, 'comment', commentId, 'restore');
    expect(
      await db.query(author.id, 'select 1 from public.comments where id = $1', [commentId]),
    ).toHaveLength(1);
  });
});

describe('suspension', () => {
  it('bans the login, takes content down, blocks new posts, and can be undone', async () => {
    const troll = await db.createUser('troll');
    const postId = await db.createPost(troll.id);
    const target = await db.createPost(author.id);
    const commentId = await comment(troll, target);
    await moderate(mod, 'user', troll.id, 'suspend', 'Harassment');

    expect(
      (
        await db.admin<{ banned_until: unknown }>('select banned_until from auth.users where id = $1', [
          troll.id,
        ])
      )[0]!.banned_until,
    ).not.toBeNull();
    expect(await sees(viewer, postId)).toBe(false);
    expect(
      await db.query(author.id, 'select 1 from public.comments where id = $1', [commentId]),
    ).toHaveLength(0);
    await expectDbError(db.createPost(troll.id), /row-level security/);
    await expectDbError(comment(troll, target), /row-level security/);

    await moderate(mod, 'user', troll.id, 'unsuspend');
    expect(await sees(viewer, postId)).toBe(true);
    expect(
      await db.query(author.id, 'select 1 from public.comments where id = $1', [commentId]),
    ).toHaveLength(1);
  });

  it('moderators cannot suspend themselves', async () => {
    await expectDbError(moderate(mod, 'user', mod.id, 'suspend'), /suspend yourself/);
  });
});

describe('text filter', () => {
  it('rejects slurs in posts, comments, profiles, collections and tags, including disguised spellings', async () => {
    await expectDbError(db.createPost(author.id, { title: 'Fag cake' }), /isn't allowed/);
    const postId = await db.createPost(author.id);
    await expectDbError(comment(viewer, postId, 'you n1gg3r'), /isn't allowed/);
    await expectDbError(
      db.query(viewer.id, `update public.profiles set bio = 'K!KE' where id = $1`, [viewer.id]),
      /isn't allowed/,
    );
    await expectDbError(
      db.query(viewer.id, `insert into public.collections (owner_id, name) values ($1, 'tranny food')`, [
        viewer.id,
      ]),
      /isn't allowed/,
    );
    await expectDbError(db.createPost(author.id, {}, { tags: ['wetback'] }), /isn't allowed/);
  });

  it('leaves ordinary food words alone', async () => {
    // Whole-word matching: these contain blocked letters but aren't slurs.
    await db.createPost(author.id, {
      title: 'Retarded sourdough with pasta e fagioli',
      review: 'Snigger-worthy spicy fig cake; retard the dough overnight.',
    });
  });
});
