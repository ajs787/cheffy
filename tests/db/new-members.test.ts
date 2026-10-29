/**
 * New to Cheffy: new_members() and the "New to Cheffy" reason in
 * suggested_friends(). Runs the real migrations with RLS.
 */
import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let me: TestUser;

const newMembers = async (user: TestUser, limit = 20, offset = 0) =>
  (
    await db.query<{ user_id: string }>(user.id, 'select user_id from public.new_members($1, $2)', [
      limit,
      offset,
    ])
  ).map((r) => r.user_id);

/** Joined `days` ago (profiles.created_at is what the app shows). */
const joined = (user: TestUser, days: number) =>
  db.admin(`update public.profiles set created_at = now() - make_interval(days => $2) where id = $1`, [
    user.id,
    days,
  ]);

beforeEach(async () => {
  db = await TestDb.create();
  me = await db.createUser('viewer');
  await joined(me, 400);
}, 60_000);

afterEach(async () => {
  await db.close();
});

describe('new_members', () => {
  it('lists eligible members newest first, never the viewer', async () => {
    const older = await db.createUser('older');
    const newer = await db.createUser('newer');
    const newest = await db.createUser('newest');
    await joined(older, 20);
    await joined(newer, 3);
    await joined(newest, 0);
    expect(await newMembers(me)).toEqual([newest.id, newer.id, older.id]);
  });

  it('includes a brand-new account with no posts or mutual friends', async () => {
    const fresh = await db.createUser('fresh');
    expect(await newMembers(me)).toContain(fresh.id);
  });

  it('leaves out followed, requested, dismissed, blocked, unverified, suspended, banned and hidden accounts', async () => {
    const followed = await db.createUser('followed');
    await db.follow(me.id, followed.id);

    const priv = await db.createUser('privcook');
    await db.admin('update public.profiles set is_private = true where id = $1', [priv.id]);
    await db.query(me.id, 'insert into public.follow_requests (requester_id, target_id) values ($1, $2)', [
      me.id,
      priv.id,
    ]);

    const dismissed = await db.createUser('dismissed');
    await db.query(
      me.id,
      'insert into public.suggestion_dismissals (user_id, dismissed_id) values ($1, $2)',
      [me.id, dismissed.id],
    );

    const blocker = await db.createUser('blocker');
    await db.query(blocker.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      blocker.id,
      me.id,
    ]);
    const blocked = await db.createUser('blocked');
    await db.query(me.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      me.id,
      blocked.id,
    ]);

    const unverified = await db.createUser('unverified');
    await db.admin('update auth.users set email_confirmed_at = null where id = $1', [unverified.id]);
    const suspended = await db.createUser('suspended');
    await db.admin('update public.profiles set suspended_at = now() where id = $1', [suspended.id]);
    const banned = await db.createUser('banned');
    await db.admin("update auth.users set banned_until = 'infinity' where id = $1", [banned.id]);
    const hidden = await db.createUser('hidden');
    await db.admin('update public.profiles set discoverable = false where id = $1', [hidden.id]);

    const visible = await db.createUser('visible');
    expect(await newMembers(me)).toEqual([visible.id]);
  });

  it('still offers a private account the viewer hasn’t asked to follow', async () => {
    const priv = await db.createUser('quietcook');
    await db.admin('update public.profiles set is_private = true where id = $1', [priv.id]);
    expect(await newMembers(me)).toContain(priv.id);
  });

  it('pages through every eligible member without repeats', async () => {
    const all: string[] = [];
    for (let i = 0; i < 7; i++) {
      const u = await db.createUser(`member${i}`);
      await joined(u, i);
      all.push(u.id);
    }
    const pages = [
      ...(await newMembers(me, 3, 0)),
      ...(await newMembers(me, 3, 3)),
      ...(await newMembers(me, 3, 6)),
    ];
    expect(pages).toEqual(all);
  });

  it('shows someone who joins after the first look', async () => {
    await db.createUser('first');
    expect(await newMembers(me)).toHaveLength(1);
    const later = await db.createUser('later');
    expect((await newMembers(me))[0]).toBe(later.id);
  });

  it('is not callable without signing in', async () => {
    await expectDbError(
      db.pg.transaction(async (tx) => {
        await tx.exec('set local role anon');
        await tx.query('select * from public.new_members(5, 0)');
      }),
      /permission denied/,
    );
  });
});

describe('suggested_friends and new members', () => {
  const suggestions = (user: TestUser) =>
    db.query<{ user_id: string; reason: string }>(
      user.id,
      'select user_id, reason from public.suggested_friends(20)',
    );

  it('suggests a new account with no posts or mutual friends as "New to Cheffy"', async () => {
    const fresh = await db.createUser('freshcook');
    expect((await suggestions(me)).find((s) => s.user_id === fresh.id)?.reason).toBe('New to Cheffy');
  });

  it('stops counting someone as new after 30 days', async () => {
    const quiet = await db.createUser('quietone');
    await joined(quiet, 31);
    expect((await suggestions(me)).map((s) => s.user_id)).not.toContain(quiet.id);
  });

  it('keeps a stronger reason and ranks it first', async () => {
    const friend = await db.createUser('friend');
    const theirFriend = await db.createUser('theirfriend');
    const fresh = await db.createUser('brandnew');
    await db.follow(me.id, friend.id);
    await db.follow(friend.id, theirFriend.id);
    const rows = await suggestions(me);
    expect(rows[0]).toMatchObject({ user_id: theirFriend.id, reason: 'Followed by @friend' });
    expect(rows.map((r) => r.user_id)).toContain(fresh.id);
  });

  it('never suggests unverified accounts', async () => {
    const unverified = await db.createUser('noemail');
    await db.admin('update auth.users set email_confirmed_at = null where id = $1', [unverified.id]);
    expect((await suggestions(me)).map((s) => s.user_id)).not.toContain(unverified.id);
  });
});
