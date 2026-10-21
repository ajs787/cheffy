import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;

const unlocks = async (user: TestUser) =>
  (await db.query<{ u: { unlocked: string[] } }>(user.id, 'select public.my_unlocks() as u'))[0]!.u.unlocked;
const code = async (user: TestUser) =>
  (await db.query<{ c: string }>(user.id, 'select public.my_invite_code() as c'))[0]!.c;
const redeem = (user: TestUser, c: string) => db.query(user.id, 'select public.redeem_invite_code($1)', [c]);

beforeAll(async () => {
  db = await TestDb.create();
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('creation unlocks', () => {
  it('unlock the theme at 3 and the recap at 10, once, from published posts only', async () => {
    const cook = await db.createUser('cook');
    await db.createPost(cook.id, { status: 'draft' });
    await db.createPost(cook.id);
    await db.createPost(cook.id);
    expect(await unlocks(cook)).toEqual([]);
    await db.createPost(cook.id);
    expect(await unlocks(cook)).toEqual(['theme_saffron']);
    for (let i = 0; i < 7; i++) await db.createPost(cook.id);
    expect(await unlocks(cook)).toEqual(['theme_saffron', 'recap']);
    // Idempotent: more posts or refreshes never duplicate.
    await db.createPost(cook.id);
    expect(await unlocks(cook)).toEqual(['theme_saffron', 'recap']);
  });

  it('are never revoked when posts are deleted', async () => {
    const baker = await db.createUser('baker');
    const ids = [await db.createPost(baker.id), await db.createPost(baker.id), await db.createPost(baker.id)];
    await db.query(baker.id, 'delete from public.posts where id = any($1::uuid[])', [ids]);
    expect(await unlocks(baker)).toEqual(['theme_saffron']);
  });

  it('cannot be granted or forged by clients', async () => {
    const sneaky = await db.createUser('sneaky');
    await expectDbError(
      db.query(sneaky.id, `insert into public.profile_unlocks (user_id, unlock) values ($1, 'recap')`, [
        sneaky.id,
      ]),
      /permission denied/,
    );
    await expectDbError(
      db.query(sneaky.id, 'select public.refresh_unlocks($1)', [sneaky.id]),
      /permission denied/,
    );
    await expectDbError(
      db.query(sneaky.id, `select public.set_profile_style('saffron', null)`),
      /isn't unlocked/,
    );
    await expectDbError(
      db.query(sneaky.id, `update public.profiles set theme = 'saffron' where id = $1`, [sneaky.id]),
      /permission denied/,
    );
  });
});

describe('made together', () => {
  it('unlocks for both people on the first accepted collaboration', async () => {
    const chef = await db.createUser('chefmt');
    const pal = await db.createUser('palmt');
    const post = await db.createPost(chef.id);
    await db.query(chef.id, 'select public.invite_collaborators($1, $2::uuid[])', [post, [pal.id]]);
    expect(await unlocks(pal)).not.toContain('made_together');
    await db.query(pal.id, 'select public.respond_to_collaboration($1, true)', [post]);
    expect(await unlocks(pal)).toContain('made_together');
    expect(await unlocks(chef)).toContain('made_together');
  });
});

describe('referrals', () => {
  it('credit two genuinely new, verified accounts and unlock the frame', async () => {
    const host = await db.createUser('host');
    const c = await code(host);
    expect(c).toMatch(/^[A-Z0-9]{8}$/);
    expect(await code(host)).toBe(c);
    const a = await db.createUser('friendone');
    const b = await db.createUser('friendtwo');
    await redeem(a, c.toLowerCase());
    expect(await unlocks(host)).not.toContain('frame_host');
    await redeem(b, ` ${c} `);
    expect(await unlocks(host)).toContain('frame_host');
    await db.query(host.id, `select public.set_profile_style(null, 'host')`);
    const [p] = await db.admin<{ frame: string }>('select frame from public.profiles where id = $1', [
      host.id,
    ]);
    expect(p!.frame).toBe('host');
  });

  it('reject self, repeats, reverse referrals, old or unverified accounts, and bad codes', async () => {
    const host = await db.createUser('host2');
    const c = await code(host);
    await expectDbError(redeem(host, c), /own invite code/);
    const fresh = await db.createUser('fresh2');
    await redeem(fresh, c);
    await expectDbError(redeem(fresh, c), /already used/);
    // The friend can't turn around and credit the host back.
    const back = await code(fresh);
    await expectDbError(redeem(host, back), /can't be used|already used/);
    const old = await db.createUser('old2');
    await db.admin(`update auth.users set created_at = now() - interval '30 days' where id = $1`, [old.id]);
    await expectDbError(redeem(old, c), /new accounts/);
    const unverified = await db.createUser('unverified2');
    await db.admin('update auth.users set email_confirmed_at = null where id = $1', [unverified.id]);
    await expectDbError(redeem(unverified, c), /confirm your email/);
    await expectDbError(redeem(await db.createUser('nobody2'), 'ZZZZZZZZ'), /isn't valid/);
  });

  it('keep referral data private', async () => {
    const host = await db.createUser('host3');
    await expectDbError(db.query(host.id, 'select * from public.referrals'), /permission denied/);
    await expectDbError(db.query(host.id, 'select * from public.invite_codes'), /permission denied/);
    const [u] = await db.query<{ u: { referrals: number } }>(host.id, 'select public.my_unlocks() as u');
    expect(Number(u!.u.referrals)).toBe(0);
  });
});

describe('cooking recap', () => {
  it('is only available once unlocked, and summarizes real data', async () => {
    const cook = await db.createUser('recapper');
    await expectDbError(db.query(cook.id, 'select public.cooking_recap()'), /unlocks at 10/);
    const korean = await db.categoryId('cuisine', 'korean');
    const baking = await db.categoryId('primary', 'baking');
    for (let i = 0; i < 7; i++) {
      await db.createPost(cook.id, { title: `Drink ${i}`, rating: 6 + i * 0.5 }, { categories: [korean] });
    }
    for (let i = 0; i < 3; i++) await db.createPost(cook.id, { primary_category_id: baking, rating: 5 });
    const [r] = await db.query<{
      r: {
        total: number;
        top: { title: string };
        by_primary: { slug: string; count: number }[];
        cuisines: { name: string }[];
      };
    }>(cook.id, 'select public.cooking_recap() as r');
    expect(Number(r!.r.total)).toBe(10);
    expect(r!.r.top.title).toBe('Drink 6');
    expect(r!.r.by_primary.map((p) => [p.slug, Number(p.count)])).toEqual([
      ['drinks', 7],
      ['baking', 3],
    ]);
    expect(r!.r.cuisines.map((c) => c.name)).toEqual(['Korean']);
  });
});
