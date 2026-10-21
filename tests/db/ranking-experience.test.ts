import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let me: TestUser;
let friend: TestUser;
let stranger: TestUser;
let drinks: string;
let baking: string;

const post = (
  user: TestUser,
  title: string,
  rating: number,
  extra: Record<string, unknown> = {},
  categories?: string[],
) =>
  db.createPost(
    user.id,
    { title, rating, primary_category_id: drinks, ...extra },
    categories ? { categories } : {},
  );
const ranking = async (user: TestUser, primary = drinks) =>
  (
    await db.query<{ title: string }>(user.id, 'select title from public.get_rankings($1, $2)', [
      user.id,
      primary,
    ])
  ).map((r) => r.title);
const placement = async (user: TestUser, id: string) =>
  (
    await db.query<{ p: Record<string, unknown> | null }>(
      user.id,
      'select public.ranking_placement($1) as p',
      [id],
    )
  )[0]!.p;

beforeAll(async () => {
  db = await TestDb.create();
  me = await db.createUser('myself');
  friend = await db.createUser('friend');
  stranger = await db.createUser('stranger');
  drinks = await db.categoryId('primary', 'drinks');
  baking = await db.categoryId('primary', 'baking');
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('placement', () => {
  it('reports the rank in the category and what it passed', async () => {
    await post(me, 'Pistachio Latte', 8.8, { made_on: '2026-10-01' });
    await post(me, 'Chai', 7.5, { made_on: '2026-10-02' });
    const matcha = await post(me, 'Strawberry Matcha', 9.4, { made_on: '2026-10-03' });
    expect(await placement(me, matcha)).toMatchObject({
      rank: 1,
      total: 3,
      primary_slug: 'drinks',
      passed_title: 'Pistachio Latte',
    });
  });

  it('only counts the same category', async () => {
    const bread = await post(me, 'Focaccia', 5, { primary_category_id: baking });
    expect(await placement(me, bread)).toMatchObject({ rank: 1, total: 1, passed_title: null });
  });

  it('does not claim to pass something newer', async () => {
    const low = await post(me, 'Plain Tea', 6, { made_on: '2026-10-04' });
    expect(await placement(me, low)).toMatchObject({ rank: 4, total: 4, passed_title: null });
  });
});

describe('head-to-head comparisons', () => {
  it('only reorder equal ratings and never change a rating', async () => {
    const a = await post(me, 'Iced Mocha', 8, { made_on: '2026-09-01' });
    const b = await post(me, 'Cold Brew', 8, { made_on: '2026-09-02' });
    // Newer first by default.
    let order = (await ranking(me)).filter((t) => t === 'Iced Mocha' || t === 'Cold Brew');
    expect(order).toEqual(['Cold Brew', 'Iced Mocha']);
    await db.query(me.id, 'select public.record_comparison($1, $2)', [a, b]);
    order = (await ranking(me)).filter((t) => t === 'Iced Mocha' || t === 'Cold Brew');
    expect(order).toEqual(['Iced Mocha', 'Cold Brew']);
    const ratings = await db.admin<{ rating: string }>(
      'select rating from public.posts where id in ($1, $2)',
      [a, b],
    );
    expect(ratings.map((r) => Number(r.rating))).toEqual([8, 8]);
    // A preference for a lower-rated creation doesn't jump the ranking.
    const top = (await ranking(me))[0];
    const chai = (await db.admin<{ id: string }>(`select id from public.posts where title = 'Chai'`))[0]!.id;
    await db.query(me.id, 'select public.record_comparison($1, $2)', [chai, a]);
    expect((await ranking(me))[0]).toBe(top);
  });

  it('suggest the closest-rated unseen opponent, and never the same pair twice', async () => {
    const x = await post(me, 'Horchata', 7.4);
    const [c1] = await db.query<{ title: string; post_id: string }>(
      me.id,
      'select * from public.comparison_candidate($1)',
      [x],
    );
    expect(c1!.title).toBe('Chai');
    await db.query(me.id, 'select public.record_comparison($1, $2, true)', [x, c1!.post_id]);
    const [c2] = await db.query<{ title: string }>(me.id, 'select * from public.comparison_candidate($1)', [
      x,
    ]);
    expect(c2?.title).not.toBe('Chai');
  });

  it('accept only your own creations, and stay private', async () => {
    const mine = await post(me, 'Lemonade', 8);
    const theirs = await post(friend, 'Their Lemonade', 8);
    await expectDbError(
      db.query(me.id, 'select public.record_comparison($1, $2)', [mine, theirs]),
      /your own creations/,
    );
    await expectDbError(
      db.query(me.id, 'select public.record_comparison($1, $1)', [mine]),
      /your own creations/,
    );
    expect(await db.query(friend.id, 'select * from public.ranking_comparisons')).toEqual([]);
    await expectDbError(
      db.query(
        me.id,
        `insert into public.ranking_comparisons (user_id, post_a, post_b, result) values ($1, $2, $3, 'a')`,
        [me.id, mine < theirs ? mine : theirs, mine < theirs ? theirs : mine],
      ),
      /permission denied/,
    );
  });
});

describe("friends' rankings", () => {
  it('lists the top creations of people you follow, respecting visibility', async () => {
    await db.follow(me.id, friend.id);
    await post(friend, 'Rose Latte', 9.6);
    await post(friend, 'Secret Brew', 9.9, { visibility: 'private' });
    await post(stranger, 'Stranger Brew', 9.9);
    const rows = await db.query<{ username: string; title: string; rank: number }>(
      me.id,
      'select username, title, rank from public.friends_top_creations($1, 2)',
      [drinks],
    );
    expect(rows.map((r) => r.title)).toEqual(['Rose Latte', 'Their Lemonade']);
    expect(rows.every((r) => r.username === 'friend')).toBe(true);
  });

  it('finds shared favorites both of you rated 8+', async () => {
    const matcha = await db.categoryId('subcategory', 'matcha', 'drinks');
    await post(me, 'My Matcha', 9, {}, [matcha]);
    await post(friend, 'Their Matcha', 8.5, {}, [matcha]);
    const rows = await db.query<{ name: string; my_title: string; their_title: string }>(
      me.id,
      'select name, my_title, their_title from public.shared_favorites($1)',
      [friend.id],
    );
    expect(rows).toEqual([{ name: 'Matcha', my_title: 'My Matcha', their_title: 'Their Matcha' }]);
  });
});
