import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let owner: TestUser;
let fan: TestUser;
let lurker: TestUser;
let publicPost: string;
let followersPost: string;

const setPrivate = (user: TestUser, value: boolean) =>
  db.query(user.id, 'update public.profiles set is_private = $1 where id = $2', [value, user.id]);
const followUser = async (user: TestUser, target: TestUser) =>
  (await db.query<{ r: string }>(user.id, 'select public.follow_user($1) as r', [target.id]))[0]!.r;
const visiblePosts = async (user: TestUser) =>
  (
    await db.query<{ id: string }>(user.id, 'select id from public.posts where author_id = $1', [owner.id])
  ).map((r) => r.id);
const requestsTo = async (user: TestUser) =>
  (
    await db.query<{ requester_id: string }>(
      user.id,
      'select requester_id from public.follow_requests where target_id = $1',
      [user.id],
    )
  ).map((r) => r.requester_id);

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.createUser('owner');
  fan = await db.createUser('fan');
  lurker = await db.createUser('lurker');
  publicPost = await db.createPost(owner.id, { visibility: 'public' }, { images: 1 });
  followersPost = await db.createPost(owner.id, { visibility: 'followers' });
  await db.follow(fan.id, owner.id);
  await setPrivate(owner, true);
  // Storage rows for the public post's photo.
  const [image] = await db.admin<{ storage_path: string }>(
    'select storage_path from public.post_images where post_id = $1',
    [publicPost],
  );
  await db.admin(`insert into storage.objects (bucket_id, name, owner) values ('post-images', $1, $2)`, [
    image!.storage_path,
    owner.id,
  ]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('private accounts', () => {
  it('keep the basic profile discoverable', async () => {
    const rows = await db.query<{ username: string; is_private: boolean }>(
      lurker.id,
      'select username, is_private from public.profiles where id = $1',
      [owner.id],
    );
    expect(rows).toEqual([{ username: 'owner', is_private: true }]);
  });

  it('hide even public posts from non-followers, everywhere', async () => {
    expect(await visiblePosts(lurker)).toEqual([]);
    const discover = await db.query<{ id: string }>(
      lurker.id,
      `select id from public.discover_posts('recent')`,
    );
    expect(discover.map((r) => r.id)).not.toContain(publicPost);
    const search = await db.query<{ id: string }>(lurker.id, `select id from public.search_posts('matcha')`);
    expect(search.map((r) => r.id)).not.toContain(publicPost);
    const ranks = await db.query(lurker.id, 'select * from public.get_rankings($1)', [owner.id]);
    expect(ranks).toEqual([]);
    const files = await db.query(
      lurker.id,
      `select name from storage.objects where bucket_id = 'post-images'`,
    );
    expect(files).toEqual([]);
    const images = await db.query(lurker.id, 'select id from public.post_images where post_id = $1', [
      publicPost,
    ]);
    expect(images).toEqual([]);
  });

  it('let approved followers see posts as before', async () => {
    expect(new Set(await visiblePosts(fan))).toEqual(new Set([publicPost, followersPost]));
  });

  it('still show counts to everyone', async () => {
    const [stats] = await db.query<{ s: { posts: number; followers: number } }>(
      lurker.id,
      'select public.profile_stats($1) as s',
      [owner.id],
    );
    expect(stats!.s.posts).toBe(2);
    expect(stats!.s.followers).toBe(1);
  });

  it('hide public collections from non-followers', async () => {
    await db.query(
      owner.id,
      `insert into public.collections (owner_id, name, visibility) values ($1, 'Weeknights', 'public')`,
      [owner.id],
    );
    expect(
      await db.query(lurker.id, 'select id from public.collections where owner_id = $1', [owner.id]),
    ).toEqual([]);
    expect(
      await db.query(fan.id, 'select id from public.collections where owner_id = $1', [owner.id]),
    ).toHaveLength(1);
  });
});

describe('follow requests', () => {
  it('turn a follow into a request, and block direct follows', async () => {
    await expectDbError(db.follow(lurker.id, owner.id), /row-level security/);
    expect(await followUser(lurker, owner)).toBe('requested');
    expect(await requestsTo(owner)).toEqual([lurker.id]);
    const [p] = await db.query<{ r: boolean }>(
      lurker.id,
      'select public.viewer_has_requested(p) as r from public.profiles p where id = $1',
      [owner.id],
    );
    expect(p!.r).toBe(true);
    // Still no access while pending.
    expect(await visiblePosts(lurker)).toEqual([]);
  });

  it('are only visible to the two people involved', async () => {
    expect(await db.query(fan.id, 'select * from public.follow_requests')).toEqual([]);
  });

  it('can be cancelled by the requester', async () => {
    await db.query(lurker.id, 'delete from public.follow_requests where requester_id = $1', [lurker.id]);
    expect(await requestsTo(owner)).toEqual([]);
  });

  it('can be declined by the target', async () => {
    await followUser(lurker, owner);
    await db.query(
      owner.id,
      'delete from public.follow_requests where requester_id = $1 and target_id = $2',
      [lurker.id, owner.id],
    );
    expect(await requestsTo(owner)).toEqual([]);
    expect(await visiblePosts(lurker)).toEqual([]);
  });

  it('grant access once accepted, and only the target can accept', async () => {
    await followUser(lurker, owner);
    await expectDbError(
      db.query(lurker.id, 'select public.accept_follow_request($1)', [lurker.id]),
      /not found/,
    );
    await db.query(owner.id, 'select public.accept_follow_request($1)', [lurker.id]);
    expect(await requestsTo(owner)).toEqual([]);
    expect(await visiblePosts(lurker)).toContain(publicPost);
  });

  it('removing a follower revokes access immediately', async () => {
    await db.query(owner.id, 'delete from public.follows where follower_id = $1 and following_id = $2', [
      lurker.id,
      owner.id,
    ]);
    expect(await visiblePosts(lurker)).toEqual([]);
  });

  it('follow public accounts immediately', async () => {
    const other = await db.createUser('openbook');
    expect(await followUser(lurker, other)).toBe('following');
  });
});

describe('switching privacy', () => {
  it('going public approves pending requests and reopens public posts', async () => {
    const latecomer = await db.createUser('latecomer');
    await followUser(latecomer, owner);
    await setPrivate(owner, false);
    expect(await requestsTo(owner)).toEqual([]);
    const [f] = await db.query<{ n: number }>(
      owner.id,
      'select count(*)::int as n from public.follows where follower_id = $1',
      [latecomer.id],
    );
    expect(f!.n).toBe(1);
    expect(await visiblePosts(lurker)).toEqual([publicPost]);
  });

  it('going private again cuts off non-followers', async () => {
    await setPrivate(owner, true);
    expect(await visiblePosts(lurker)).toEqual([]);
  });

  it('blocking clears pending requests both ways', async () => {
    const pest = await db.createUser('pest');
    await followUser(pest, owner);
    await db.query(owner.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      owner.id,
      pest.id,
    ]);
    expect(await requestsTo(owner)).not.toContain(pest.id);
  });

  it('cannot be changed for someone else', async () => {
    const rows = await db.query(
      lurker.id,
      'update public.profiles set is_private = false where id = $1 returning id',
      [owner.id],
    );
    expect(rows).toEqual([]);
  });
});
