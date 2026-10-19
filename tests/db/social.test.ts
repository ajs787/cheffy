import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let a: TestUser;
let b: TestUser;
let c: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  a = await db.createUser('user_a');
  b = await db.createUser('user_b');
  c = await db.createUser('user_c');
}, 60_000);

afterAll(async () => {
  await db.close();
});

const likeCount = async (postId: string) =>
  Number((await db.admin<{ like_count: number }>('select like_count from public.posts where id = $1', [postId]))[0]
    .like_count);

describe('follows', () => {
  it('users cannot follow themselves', async () => {
    await expectDbError(db.follow(a.id, a.id), /follows_no_self_follow/);
  });

  it('users cannot create follows on behalf of others', async () => {
    await expectDbError(
      db.query(a.id, 'insert into public.follows (follower_id, following_id) values ($1, $2)', [b.id, c.id]),
      /row-level security/,
    );
  });

  it('following twice is rejected', async () => {
    await db.follow(a.id, b.id);
    await expectDbError(db.follow(a.id, b.id), /duplicate key/);
  });

  it('users can unfollow and remove a follower, but not unrelated follows', async () => {
    await db.follow(c.id, b.id);
    const removedByStranger = await db.query(
      a.id,
      'delete from public.follows where follower_id = $1 and following_id = $2 returning 1',
      [c.id, b.id],
    );
    expect(removedByStranger).toHaveLength(0);
    const removedByFollowee = await db.query(
      b.id,
      'delete from public.follows where follower_id = $1 and following_id = $2 returning 1',
      [c.id, b.id],
    );
    expect(removedByFollowee).toHaveLength(1);
  });

  it('exposes viewer_is_following as a computed field', async () => {
    const [row] = await db.query<{ following: boolean }>(
      a.id,
      'select public.viewer_is_following(p) as following from public.profiles p where id = $1',
      [b.id],
    );
    expect(row.following).toBe(true);
  });
});

describe('likes', () => {
  it('a user can like a post once and the counter tracks likes', async () => {
    const postId = await db.createPost(a.id);
    await db.query(b.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [b.id, postId]);
    await expectDbError(
      db.query(b.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [b.id, postId]),
      /duplicate key/,
    );
    await db.query(c.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [c.id, postId]);
    expect(await likeCount(postId)).toBe(2);

    const [liked] = await db.query<{ liked: boolean }>(
      b.id,
      'select public.viewer_has_liked(p) as liked from public.posts p where id = $1',
      [postId],
    );
    expect(liked.liked).toBe(true);

    await db.query(b.id, 'delete from public.likes where user_id = $1 and post_id = $2', [b.id, postId]);
    expect(await likeCount(postId)).toBe(1);
  });

  it("cannot like on behalf of someone else or remove someone else's like", async () => {
    const postId = await db.createPost(a.id);
    await expectDbError(
      db.query(b.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [c.id, postId]),
      /row-level security/,
    );
    await db.query(c.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [c.id, postId]);
    const removed = await db.query(b.id, 'delete from public.likes where post_id = $1 returning 1', [postId]);
    expect(removed).toHaveLength(0);
    expect(await likeCount(postId)).toBe(1);
  });
});

describe('comments', () => {
  let postId: string;
  let commentId: string;

  beforeAll(async () => {
    postId = await db.createPost(a.id);
    [{ id: commentId }] = await db.query<{ id: string }>(
      b.id,
      `insert into public.comments (post_id, author_id, body) values ($1, $2, 'Looks amazing!') returning id`,
      [postId, b.id],
    );
  });

  it('increments comment_count', async () => {
    const [post] = await db.admin<{ comment_count: number }>(
      'select comment_count from public.posts where id = $1',
      [postId],
    );
    expect(post.comment_count).toBe(1);
  });

  it('rejects empty and oversized comments', async () => {
    for (const body of ['   ', 'x'.repeat(1001)]) {
      await expectDbError(
        db.query(b.id, 'insert into public.comments (post_id, author_id, body) values ($1, $2, $3)', [
          postId,
          b.id,
          body,
        ]),
        /comments_body_length/,
      );
    }
  });

  it("only the comment author can edit it", async () => {
    const edited = await db.query(c.id, `update public.comments set body = 'x' where id = $1 returning 1`, [
      commentId,
    ]);
    expect(edited).toHaveLength(0);
    const own = await db.query(b.id, `update public.comments set body = 'So good!' where id = $1 returning 1`, [
      commentId,
    ]);
    expect(own).toHaveLength(1);
  });

  it('strangers cannot delete comments; the post author can', async () => {
    const byStranger = await db.query(c.id, 'delete from public.comments where id = $1 returning 1', [commentId]);
    expect(byStranger).toHaveLength(0);
    const byPostAuthor = await db.query(a.id, 'delete from public.comments where id = $1 returning 1', [commentId]);
    expect(byPostAuthor).toHaveLength(1);
  });
});

describe('saved posts and collections', () => {
  it('saved posts are private to the saver', async () => {
    const postId = await db.createPost(a.id);
    await db.query(b.id, 'insert into public.saved_posts (user_id, post_id) values ($1, $2)', [b.id, postId]);
    expect(await db.query(c.id, 'select * from public.saved_posts where post_id = $1', [postId])).toHaveLength(0);
    expect(await db.query(a.id, 'select * from public.saved_posts where post_id = $1', [postId])).toHaveLength(0);
    expect(await db.query(b.id, 'select * from public.saved_posts where post_id = $1', [postId])).toHaveLength(1);
  });

  it('collections respect visibility and ownership', async () => {
    const postId = await db.createPost(a.id);
    const [pub] = await db.query<{ id: string }>(
      b.id,
      `insert into public.collections (owner_id, name) values ($1, 'Favorite Matcha') returning id`,
      [b.id],
    );
    const [priv] = await db.query<{ id: string }>(
      b.id,
      `insert into public.collections (owner_id, name, visibility) values ($1, 'Secret', 'private') returning id`,
      [b.id],
    );
    await db.query(b.id, 'insert into public.collection_items (collection_id, post_id) values ($1, $2)', [
      pub.id,
      postId,
    ]);

    const seenByC = await db.query<{ id: string }>(c.id, 'select id from public.collections where owner_id = $1', [
      b.id,
    ]);
    expect(seenByC.map((r) => r.id)).toEqual([pub.id]);
    expect(
      await db.query(c.id, 'select * from public.collection_items where collection_id = $1', [pub.id]),
    ).toHaveLength(1);

    await expectDbError(
      db.query(c.id, 'insert into public.collection_items (collection_id, post_id) values ($1, $2)', [pub.id, postId]),
      /row-level security/,
    );
    const renamed = await db.query(c.id, `update public.collections set name = 'mine' where id = $1 returning 1`, [
      priv.id,
    ]);
    expect(renamed).toHaveLength(0);
    await expectDbError(
      db.query(b.id, `insert into public.collections (owner_id, name) values ($1, 'favorite matcha ')`, [b.id]),
      /collections_owner_name_key/,
    );
  });
});

describe('blocking', () => {
  it('blocking removes follows both ways and hides content in both directions', async () => {
    const blocker = await db.createUser('blocker');
    const blocked = await db.createUser('blocked');
    await db.follow(blocker.id, blocked.id);
    await db.follow(blocked.id, blocker.id);
    const blockerPost = await db.createPost(blocker.id);
    const blockedPost = await db.createPost(blocked.id);

    await db.query(blocker.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      blocker.id,
      blocked.id,
    ]);

    expect(
      await db.admin('select 1 from public.follows where $1 in (follower_id, following_id)', [blocked.id]),
    ).toHaveLength(0);
    expect(await db.query(blocked.id, 'select id from public.posts where id = $1', [blockerPost])).toHaveLength(0);
    expect(await db.query(blocker.id, 'select id from public.posts where id = $1', [blockedPost])).toHaveLength(0);
    expect(await db.query(blocked.id, 'select id from public.profiles where id = $1', [blocker.id])).toHaveLength(0);
    await expectDbError(db.follow(blocked.id, blocker.id), /row-level security/);
    await expectDbError(
      db.query(blocked.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [blocked.id, blockerPost]),
      /row-level security/,
    );

    // The block itself is private to the blocker.
    expect(await db.query(blocked.id, 'select * from public.user_blocks')).toHaveLength(0);

    // Unblocking restores visibility of public content.
    await db.query(blocker.id, 'delete from public.user_blocks where blocked_id = $1', [blocked.id]);
    expect(await db.query(blocked.id, 'select id from public.posts where id = $1', [blockerPost])).toHaveLength(1);
  });

  it('hides comments from blocked users', async () => {
    const owner = await db.createUser('owner2');
    const troll = await db.createUser('troll');
    const postId = await db.createPost(owner.id);
    await db.query(troll.id, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'meh')`, [
      postId,
      troll.id,
    ]);
    await db.query(owner.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      owner.id,
      troll.id,
    ]);
    expect(await db.query(owner.id, 'select * from public.comments where post_id = $1', [postId])).toHaveLength(0);
  });
});

describe('reports', () => {
  it('users can file reports but only see their own', async () => {
    const postId = await db.createPost(a.id);
    await db.query(
      b.id,
      `insert into public.reports (reporter_id, target_type, target_post_id, reason) values ($1, 'post', $2, 'spam')`,
      [b.id, postId],
    );
    expect(await db.query(b.id, 'select * from public.reports')).toHaveLength(1);
    expect(await db.query(c.id, 'select * from public.reports')).toHaveLength(0);
  });

  it('reports must reference their target and cannot be filed as someone else', async () => {
    await expectDbError(
      db.query(b.id, `insert into public.reports (reporter_id, target_type, reason) values ($1, 'post', 'spam')`, [
        b.id,
      ]),
      /report target is missing/,
    );
    await expectDbError(
      db.query(
        b.id,
        `insert into public.reports (reporter_id, target_type, target_user_id, reason) values ($1, 'user', $2, 'spam')`,
        [c.id, a.id],
      ),
      /row-level security/,
    );
  });
});
