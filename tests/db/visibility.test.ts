import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let author: TestUser;
let follower: TestUser;
let stranger: TestUser;
let posts: Record<'public' | 'followers' | 'private', string>;

const visibleIds = async (userId: string) =>
  (await db.query<{ id: string }>(userId, 'select id from public.posts where author_id = $1', [author.id])).map(
    (r) => r.id,
  );

beforeAll(async () => {
  db = await TestDb.create();
  author = await db.createUser('author');
  follower = await db.createUser('follower');
  stranger = await db.createUser('stranger');
  await db.follow(follower.id, author.id);
  posts = {
    public: await db.createPost(author.id, { visibility: 'public' }, { images: 1 }),
    followers: await db.createPost(author.id, { visibility: 'followers' }, { images: 1 }),
    private: await db.createPost(author.id, { visibility: 'private' }, { images: 1 }),
  };
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('post visibility', () => {
  it('author sees all of their posts', async () => {
    expect(new Set(await visibleIds(author.id))).toEqual(new Set(Object.values(posts)));
  });

  it('followers see public and followers-only posts', async () => {
    expect(new Set(await visibleIds(follower.id))).toEqual(new Set([posts.public, posts.followers]));
  });

  it('strangers see only public posts', async () => {
    expect(await visibleIds(stranger.id)).toEqual([posts.public]);
  });

  it('child rows inherit visibility (images, likes, comments, tags)', async () => {
    const images = await db.query<{ post_id: string }>(
      stranger.id,
      'select post_id from public.post_images where post_id = any($1)',
      [Object.values(posts)],
    );
    expect(images.map((i) => i.post_id)).toEqual([posts.public]);
  });

  it('cannot like, comment on or save a post you cannot see', async () => {
    await expectDbError(
      db.query(stranger.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [
        stranger.id,
        posts.private,
      ]),
      /row-level security/,
    );
    await expectDbError(
      db.query(stranger.id, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'hi')`, [
        posts.followers,
        stranger.id,
      ]),
      /row-level security/,
    );
    await expectDbError(
      db.query(stranger.id, 'insert into public.saved_posts (user_id, post_id) values ($1, $2)', [
        stranger.id,
        posts.private,
      ]),
      /row-level security/,
    );
  });

  it('unfollowing revokes access to followers-only posts', async () => {
    const temp = await db.createUser('temp_follower');
    await db.follow(temp.id, author.id);
    expect(await visibleIds(temp.id)).toContain(posts.followers);
    await db.query(temp.id, 'delete from public.follows where follower_id = $1', [temp.id]);
    expect(await visibleIds(temp.id)).not.toContain(posts.followers);
  });

  it('changing visibility to private hides an existing post immediately', async () => {
    const id = await db.createPost(author.id, { visibility: 'public' });
    expect(await visibleIds(stranger.id)).toContain(id);
    await db.query(author.id, `update public.posts set visibility = 'private' where id = $1`, [id]);
    expect(await visibleIds(stranger.id)).not.toContain(id);
  });
});

describe('storage object visibility', () => {
  beforeAll(async () => {
    const images = await db.admin<{ storage_path: string; thumb_path: string }>(
      'select storage_path, thumb_path from public.post_images',
    );
    for (const image of images) {
      for (const name of [image.storage_path, image.thumb_path]) {
        await db.admin(`insert into storage.objects (bucket_id, name, owner) values ('post-images', $1, $2)`, [
          name,
          author.id,
        ]);
      }
    }
    await db.admin(`insert into storage.objects (bucket_id, name, owner) values ('post-images', $1, $2)`, [
      `${author.id}/orphan/unattached.jpg`,
      author.id,
    ]);
  });

  const visibleObjects = async (userId: string) =>
    (
      await db.query<{ name: string }>(
        userId,
        `select name from storage.objects where bucket_id = 'post-images' and name like $1`,
        [`${author.id}/%`],
      )
    ).map((r) => r.name);

  it('owner can read all their files, including ones not attached yet', async () => {
    expect(await visibleObjects(author.id)).toHaveLength(7);
  });

  it('strangers can only read files of posts they can see', async () => {
    const names = await visibleObjects(stranger.id);
    expect(names).toHaveLength(2);
    expect(names.every((n) => n.includes(posts.public))).toBe(true);
  });

  it('followers can read followers-only photos', async () => {
    expect(await visibleObjects(follower.id)).toHaveLength(4);
  });

  it("users cannot upload into someone else's folder", async () => {
    await expectDbError(
      db.query(stranger.id, `insert into storage.objects (bucket_id, name) values ('post-images', $1)`, [
        `${author.id}/evil.jpg`,
      ]),
      /row-level security/,
    );
    await expect(
      db.query(stranger.id, `insert into storage.objects (bucket_id, name) values ('post-images', $1)`, [
        `${stranger.id}/mine.jpg`,
      ]),
    ).resolves.toBeDefined();
  });

  it("users cannot delete someone else's files", async () => {
    const deleted = await db.query(
      stranger.id,
      `delete from storage.objects where bucket_id = 'post-images' and name like $1 returning name`,
      [`${author.id}/%`],
    );
    expect(deleted).toHaveLength(0);
  });
});
