import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let me: TestUser;

const search = async (user: TestUser, q: string, offset = 0, limit = 20) =>
  (
    await db.query<{ username: string }>(user.id, 'select username from public.search_profiles($1, $2, $3)', [
      q,
      offset,
      limit,
    ])
  ).map((r) => r.username);

const suggestions = async (user: TestUser) =>
  db.query<{ username: string; reason: string }>(
    user.id,
    `select p.username, s.reason from public.suggested_friends(20) s join public.profiles p on p.id = s.user_id`,
  );

beforeEach(async () => {
  db = await TestDb.create();
  me = await db.createUser('searcher');
}, 60_000);

afterEach(async () => {
  await db.close();
});

describe('search_profiles', () => {
  it('matches partial usernames and names, best matches first, and pages', async () => {
    for (const u of ['pasta_queen', 'queenie', 'the_queen', 'bob']) await db.createUser(u);
    await db.admin(`update public.profiles set display_name = 'Queen Bee' where username = 'bob'`);
    expect(await search(me, 'queen')).toEqual(['queenie', 'bob', 'pasta_queen', 'the_queen']);
    expect(await search(me, 'QUEEN', 0, 2)).toEqual(['queenie', 'bob']);
    expect(await search(me, 'queen', 2, 2)).toEqual(['pasta_queen', 'the_queen']);
  });

  it('treats _ and % literally, and ignores empty input', async () => {
    await db.createUser('ab_cd');
    await db.createUser('abxcd');
    expect(await search(me, 'b_c')).toEqual(['ab_cd']);
    expect(await search(me, '%')).toEqual([]);
    expect(await search(me, '   ')).toEqual([]);
  });

  it('hides blocked people both ways and suspended accounts, but finds private accounts', async () => {
    const blocked = await db.createUser('cook_blocked');
    const blocker = await db.createUser('cook_blocker');
    const priv = await db.createUser('cook_private');
    const gone = await db.createUser('cook_suspended');
    await db.query(me.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      me.id,
      blocked.id,
    ]);
    await db.query(blocker.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      blocker.id,
      me.id,
    ]);
    await db.query(priv.id, 'update public.profiles set is_private = true where id = $1', [priv.id]);
    await db.admin('update public.profiles set suspended_at = now() where id = $1', [gone.id]);
    expect(await search(me, 'cook_')).toEqual(['cook_private']);
  });
});

describe('suggested_friends', () => {
  it('ranks mutual follows, then followers, then shared interests, then activity, with true labels', async () => {
    const friendA = await db.createUser('friend_a');
    const friendB = await db.createUser('friend_b');
    const popular = await db.createUser('popular'); // followed by both my friends
    const fof = await db.createUser('fof'); // followed by one
    const fan = await db.createUser('fan');
    const baker = await db.createUser('baker');
    const busy = await db.createUser('busy');
    await db.follow(me.id, friendA.id);
    await db.follow(me.id, friendB.id);
    await db.follow(friendA.id, popular.id);
    await db.follow(friendB.id, popular.id);
    await db.follow(friendA.id, fof.id);
    await db.follow(fan.id, me.id);
    const baking = await db.categoryId('primary', 'baking');
    await db.createPost(me.id, { primary_category_id: baking });
    await db.createPost(baker.id, { primary_category_id: baking });
    await db.createPost(baker.id, { primary_category_id: baking });
    await db.createPost(busy.id);
    // Long-standing accounts, so "New to Cheffy" doesn't apply here.
    await db.admin("update public.profiles set created_at = now() - interval '60 days'");
    const list = await suggestions(me);
    expect(list.map((s) => s.username)).toEqual(['popular', 'fof', 'fan', 'baker', 'busy']);
    expect(list[0]!.reason).toMatch(/^Followed by @friend_[ab] and 1 other$/);
    expect(list[1]!.reason).toBe('Followed by @friend_a');
    expect(list[2]!.reason).toBe('Follows you');
    expect(list[3]!.reason).toBe('Also loves baking');
    expect(list[4]!.reason).toBe('Active on Cheffy');
  });

  it('never suggests people who opted out, and pages the full list', async () => {
    const shy = await db.createUser('shy');
    await db.createPost(shy.id);
    await db.query(shy.id, 'update public.profiles set discoverable = false where id = $1', [shy.id]);
    for (let i = 0; i < 5; i++) await db.createPost((await db.createUser(`cook${i}`)).id);
    const all = await suggestions(me);
    expect(all.map((s) => s.username)).not.toContain('shy');
    const page = (offset: number) =>
      db.query<{ user_id: string }>(me.id, 'select user_id from public.suggested_friends(2, $1)', [offset]);
    const pages = [...(await page(0)), ...(await page(2)), ...(await page(4))].map((r) => r.user_id);
    expect(new Set(pages).size).toBe(5);
  });

  it('does not reveal what private accounts make', async () => {
    const secret = await db.createUser('secret');
    await db.query(secret.id, 'update public.profiles set is_private = true where id = $1', [secret.id]);
    const baking = await db.categoryId('primary', 'baking');
    await db.createPost(me.id, { primary_category_id: baking });
    await db.createPost(secret.id, { primary_category_id: baking });
    await db.createPost(secret.id, { primary_category_id: baking });
    // Not new (a new private account may be suggested as "New to Cheffy",
    // which says nothing about what it makes).
    await db.admin("update public.profiles set created_at = now() - interval '60 days'");
    expect(await suggestions(me)).toEqual([]);
  });

  it('leaves out people you follow, have requested, blocked, or dismissed', async () => {
    const followed = await db.createUser('followed');
    const requested = await db.createUser('requested');
    const blocked = await db.createUser('blockedx');
    const dismissed = await db.createUser('dismissed');
    for (const u of [followed, requested, blocked, dismissed]) await db.createPost(u.id);
    await db.follow(me.id, followed.id);
    await db.admin('insert into public.follow_requests (requester_id, target_id) values ($1, $2)', [
      me.id,
      requested.id,
    ]);
    await db.query(me.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      me.id,
      blocked.id,
    ]);
    await db.query(
      me.id,
      'insert into public.suggestion_dismissals (user_id, dismissed_id) values ($1, $2)',
      [me.id, dismissed.id],
    );
    expect(await suggestions(me)).toEqual([]);
  });

  it('keeps dismissals private to the person who made them', async () => {
    const other = await db.createUser('other');
    const target = await db.createUser('target');
    await db.query(
      other.id,
      'insert into public.suggestion_dismissals (user_id, dismissed_id) values ($1, $2)',
      [other.id, target.id],
    );
    expect(await db.query(me.id, 'select * from public.suggestion_dismissals')).toEqual([]);
    await expectDbError(
      db.query(me.id, 'insert into public.suggestion_dismissals (user_id, dismissed_id) values ($1, $2)', [
        other.id,
        target.id,
      ]),
      /row-level security/,
    );
  });
});
