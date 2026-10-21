import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let viewer: TestUser;

const titles = async (user: TestUser) =>
  (await db.query<{ title: string }>(user.id, 'select title from public.most_hated_posts()')).map((r) => r.title);

/** A creator whose account is old enough and verified. */
async function cook(name: string): Promise<TestUser> {
  const user = await db.createUser(name);
  await db.admin(`update auth.users set created_at = now() - interval '5 days' where id = $1`, [user.id]);
  return user;
}

const post = (user: TestUser, title: string, rating: number, overrides: Record<string, unknown> = {}) =>
  db.createPost(user.id, { title, rating, ...overrides }, { images: 1 });

beforeAll(async () => {
  db = await TestDb.create();
  viewer = await cook('viewer');
}, 60_000);

afterAll(async () => {
  await db.close();
});

// Each test starts from a clean slate of posts.
beforeEach(async () => {
  await db.admin('delete from public.reports');
  await db.admin('delete from public.user_blocks');
  await db.admin('delete from public.posts');
});

describe('most_hated_posts', () => {
  it('hides itself until there are enough eligible posts', async () => {
    const a = await cook('mh_a');
    const b = await cook('mh_b');
    await post(a, 'Burnt toast', 1.5);
    await post(b, 'Salty cookies', 2.0);
    expect(await titles(viewer)).toEqual([]);
    const c = await cook('mh_c');
    await post(c, 'Flat soufflé', 3.0);
    expect(await titles(viewer)).toEqual(['Burnt toast', 'Salty cookies', 'Flat soufflé']);
  });

  it('ranks lowest first with a deterministic tie-break, one post per creator, under the ceiling', async () => {
    const a = await cook('rk_a');
    const b = await cook('rk_b');
    const c = await cook('rk_c');
    const d = await cook('rk_d');
    await post(a, 'A worst', 1.0);
    await post(a, 'A also bad', 1.5); // same creator: only their lowest counts
    await post(b, 'B tie', 2.0);
    await post(c, 'C tie', 2.0);
    await post(d, 'D fine', 7.5); // above the 5.0 ceiling
    const first = await titles(viewer);
    expect(first).toHaveLength(3);
    expect(first[0]).toBe('A worst');
    expect(first.slice(1).sort()).toEqual(['B tie', 'C tie']);
    expect(await titles(viewer)).toEqual(first); // stable across calls
  });

  it('leaves out private, followers-only, opted-out, photo-less, old and draft posts', async () => {
    const ok = [await cook('ok_1'), await cook('ok_2'), await cook('ok_3')];
    for (const [i, u] of ok.entries()) await post(u, `Eligible ${i}`, 2);
    const priv = await cook('ex_private');
    await db.query(priv.id, 'update public.profiles set is_private = true where id = $1', [priv.id]);
    await post(priv, 'Private account', 0.5);
    await post(await cook('ex_followers'), 'Followers only', 0.5, { visibility: 'followers' });
    const optOut = await cook('ex_optout');
    await db.query(optOut.id, 'update public.profiles set allow_most_hated = false where id = $1', [optOut.id]);
    await post(optOut, 'Opted out', 0.5);
    await db.createPost((await cook('ex_nophoto')).id, { title: 'No photo', rating: 0.5 });
    const old = await cook('ex_old');
    const oldId = await post(old, 'Last month', 0.5);
    // published_at is trigger-protected; skip triggers to backdate the fixture.
    await db.pg.transaction(async (tx) => {
      await tx.exec(`set local session_replication_role = replica`);
      await tx.query(`update public.posts set published_at = now() - interval '8 days' where id = $1`, [oldId]);
    });
    await post(await cook('ex_draft'), 'Draft', 0.5, { status: 'draft' });

    expect((await titles(viewer)).sort()).toEqual(['Eligible 0', 'Eligible 1', 'Eligible 2']);
  });

  it('ignores brand-new and unverified accounts (anti-spam)', async () => {
    for (const n of ['sp_1', 'sp_2', 'sp_3']) await post(await cook(n), `Real ${n}`, 3);
    const fresh = await db.createUser('sp_fresh'); // created just now
    await post(fresh, 'Fresh account', 0.1);
    const unverified = await cook('sp_unverified');
    await db.admin('update auth.users set email_confirmed_at = null where id = $1', [unverified.id]);
    await post(unverified, 'Unverified', 0.1);
    expect(await titles(viewer)).not.toEqual(expect.arrayContaining(['Fresh account']));
    expect(await titles(viewer)).not.toEqual(expect.arrayContaining(['Unverified']));
  });

  it('drops reported posts and creators the viewer has blocked', async () => {
    const people = [await cook('rb_1'), await cook('rb_2'), await cook('rb_3'), await cook('rb_4')];
    const ids = [];
    for (const [i, u] of people.entries()) ids.push(await post(u, `Dish ${i}`, 1 + i));
    await db.query(viewer.id, `insert into public.reports (reporter_id, target_type, target_post_id, reason)
                               values ($1, 'post', $2, 'spam')`, [viewer.id, ids[0]]);
    expect(await titles(viewer)).toEqual(['Dish 1', 'Dish 2', 'Dish 3']);
    await db.query(viewer.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      viewer.id,
      people[1]!.id,
    ]);
    // Only two left for this viewer: below the minimum, so nothing shows.
    expect(await titles(viewer)).toEqual([]);
  });

  it('is not callable signed out, and its config is private', async () => {
    await expectDbError(
      db.pg.transaction(async (tx) => {
        await tx.exec('set local role anon');
        await tx.query('select * from public.most_hated_posts()');
      }),
      /permission denied/,
    );
    await expectDbError(db.query(viewer.id, 'select * from public.app_config'), /permission denied/);
    await expectDbError(
      db.query(viewer.id, `select public.config_number('most_hated.min_items', 0)`),
      /permission denied/,
    );
  });
});
