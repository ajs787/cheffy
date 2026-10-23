import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let cook: TestUser;
let viewer: TestUser;

const row = async (id: string) =>
  (
    await db.admin<{ is_budget: boolean; budget_cost_cents: number | null }>(
      'select is_budget, budget_cost_cents from public.posts where id = $1',
      [id],
    )
  )[0]!;

const save = (user: TestUser, post: Record<string, unknown>) =>
  db.query(user.id, 'select public.save_post($1::jsonb)', [JSON.stringify(post)]);

const discover = async (user: TestUser, args: string) =>
  (await db.query<{ title: string }>(user.id, `select title from public.discover_posts(${args})`)).map(
    (r) => r.title,
  );

beforeAll(async () => {
  db = await TestDb.create();
  cook = await db.createUser('budgetcook');
  viewer = await db.createUser('budgetfan');
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('Budget Eats', () => {
  it('saves the tag and an optional cost per serving', async () => {
    const priced = await db.createPost(cook.id, {
      title: 'Rice and beans',
      is_budget: true,
      budget_cost_cents: 320,
    });
    const unpriced = await db.createPost(cook.id, { title: 'Lentil soup', is_budget: true });
    const normal = await db.createPost(cook.id, { title: 'Steak' });
    expect(await row(priced)).toEqual({ is_budget: true, budget_cost_cents: 320 });
    expect(await row(unpriced)).toEqual({ is_budget: true, budget_cost_cents: null });
    expect(await row(normal)).toEqual({ is_budget: false, budget_cost_cents: null });
  });

  it('keeps Budget Eats when an older app edits the post without the fields', async () => {
    const id = await db.createPost(cook.id, { title: 'Pasta', is_budget: true, budget_cost_cents: 250 });
    const base = {
      id,
      title: 'Pasta e fagioli',
      primary_category_id: await db.categoryId('primary', 'cooking'),
      rating: 8,
    };
    await save(cook, base); // no is_budget key, like builds ≤ 7
    expect(await row(id)).toEqual({ is_budget: true, budget_cost_cents: 250 });
    await save(cook, { ...base, is_budget: false, budget_cost_cents: 250 }); // turned off: cost cleared too
    expect(await row(id)).toEqual({ is_budget: false, budget_cost_cents: null });
  });

  it('rejects a cost without the tag, or outside $0.01–$1,000', async () => {
    const id = await db.createPost(cook.id, { title: 'Toast' });
    await expectDbError(
      db.query(cook.id, 'update public.posts set budget_cost_cents = 100 where id = $1', [id]),
      /posts_budget_cost_needs_tag/,
    );
    await expectDbError(
      db.createPost(cook.id, { title: 'Gold leaf', is_budget: true, budget_cost_cents: 100001 }),
      /posts_budget_cost_range/,
    );
    await expectDbError(
      db.createPost(cook.id, { title: 'Free', is_budget: true, budget_cost_cents: 0 }),
      /posts_budget_cost_range/,
    );
  });

  it('filters by stored price and sorts cheapest first, leaving out unpriced posts', async () => {
    await db.admin('delete from public.posts');
    await db.createPost(cook.id, { title: 'Two dollar', is_budget: true, budget_cost_cents: 200, rating: 6 });
    await db.createPost(cook.id, { title: 'Four fifty', is_budget: true, budget_cost_cents: 450, rating: 9 });
    await db.createPost(cook.id, { title: 'Nine', is_budget: true, budget_cost_cents: 900, rating: 7 });
    await db.createPost(cook.id, { title: 'Unpriced', is_budget: true, rating: 8 });
    await db.createPost(cook.id, { title: 'Not budget', rating: 10 });

    expect((await discover(viewer, 'p_budget => true')).sort()).toEqual([
      'Four fifty',
      'Nine',
      'Two dollar',
      'Unpriced',
    ]);
    expect(await discover(viewer, 'p_budget => true, p_max_cost_cents => 300')).toEqual(['Two dollar']);
    expect((await discover(viewer, 'p_budget => true, p_max_cost_cents => 500')).sort()).toEqual([
      'Four fifty',
      'Two dollar',
    ]);
    expect(await discover(viewer, "p_sort => 'cheapest', p_budget => true")).toEqual([
      'Two dollar',
      'Four fifty',
      'Nine',
    ]);
    expect(await discover(viewer, "p_sort => 'top', p_budget => true")).toEqual([
      'Four fifty',
      'Unpriced',
      'Nine',
      'Two dollar',
    ]);
  });

  it('follows the usual visibility rules', async () => {
    await db.admin('delete from public.posts');
    await db.createPost(cook.id, { title: 'Public cheap', is_budget: true, budget_cost_cents: 100 });
    await db.createPost(cook.id, {
      title: 'Followers cheap',
      is_budget: true,
      budget_cost_cents: 100,
      visibility: 'followers',
    });
    await db.createPost(cook.id, {
      title: 'Private cheap',
      is_budget: true,
      budget_cost_cents: 100,
      visibility: 'private',
    });
    expect(await discover(viewer, 'p_budget => true')).toEqual(['Public cheap']);
  });
});
