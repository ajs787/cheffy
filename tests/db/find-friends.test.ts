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
  it('explains each suggestion and ranks followers, then friends of friends', async () => {
    const fan = await db.createUser('fan');
    const friend = await db.createUser('friend');
    const fof = await db.createUser('fof');
    const busy = await db.createUser('busy');
    await db.follow(fan.id, me.id);
    await db.follow(me.id, friend.id);
    await db.follow(friend.id, fof.id);
    await db.createPost(busy.id);
    expect(await suggestions(me)).toEqual([
      { username: 'fan', reason: 'Follows you' },
      { username: 'fof', reason: 'Followed by @friend' },
      { username: 'busy', reason: 'Active on Cheffy' },
    ]);
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
