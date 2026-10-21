import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let ana: TestUser;
let ben: TestUser;

const names = async (postId: string) =>
  (
    await db.admin<{ name: string }>(
      `select c.name from public.post_categories pc join public.categories c on c.id = pc.category_id
       where pc.post_id = $1 order by pc.position`,
      [postId],
    )
  ).map((r) => r.name);

beforeAll(async () => {
  db = await TestDb.create();
  ana = await db.createUser('ana');
  ben = await db.createUser('ben');
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('taxonomy v3', () => {
  it('has Turkish and the full baking list, in order', async () => {
    expect(await db.categoryId('cuisine', 'turkish')).toBeTruthy();
    const baking = await db.admin<{ name: string }>(
      `select c.name from public.categories c join public.categories p on p.id = c.parent_id
       where p.slug = 'baking' and not c.is_custom order by c.sort_order`,
    );
    expect(baking.map((r) => r.name).slice(0, 13)).toEqual([
      'Pizza',
      'Bread',
      'Cookies',
      'Brownies',
      'Cakes',
      'Cheesecake',
      'Muffins',
      'Pastries',
      'Pies',
      'Tarts',
      'Rolls',
      'Bagels',
      'Biscuits',
    ]);
  });

  it('lets pizza be baking and Italian at once', async () => {
    const id = await db.createPost(
      ana.id,
      { primary_category_id: await db.categoryId('primary', 'baking') },
      {
        categories: [
          await db.categoryId('subcategory', 'pizza', 'baking'),
          await db.categoryId('cuisine', 'italian'),
        ],
      },
    );
    expect(await names(id)).toEqual(['Pizza', 'Italian']);
  });
});

describe('custom labels', () => {
  it('create a reusable label, normalized so it never duplicates', async () => {
    const cooking = await db.categoryId('primary', 'cooking');
    const first = await db.createPost(
      ana.id,
      { primary_category_id: cooking },
      { custom: [{ kind: 'cuisine', label: '  Uyghur   ' }] },
    );
    const second = await db.createPost(
      ben.id,
      { primary_category_id: cooking },
      { custom: [{ kind: 'cuisine', label: 'UYGHUR' }] },
    );
    expect(await names(first)).toEqual(['Uyghur']);
    expect(await names(second)).toEqual(['Uyghur']);
    const rows = await db.admin(
      `select id from public.categories where kind = 'cuisine' and slug = 'uyghur'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('resolve to the built-in one when it exists', async () => {
    const id = await db.createPost(ana.id, {}, { custom: [{ kind: 'cuisine', label: 'turkish' }] });
    expect(await names(id)).toEqual(['Turkish']);
    const [row] = await db.admin<{ is_custom: boolean }>(
      `select is_custom from public.categories where slug = 'turkish'`,
    );
    expect(row!.is_custom).toBe(false);
  });

  it('can be custom baking subtypes under the post’s primary', async () => {
    const baking = await db.categoryId('primary', 'baking');
    const id = await db.createPost(
      ana.id,
      { primary_category_id: baking },
      { custom: [{ kind: 'subcategory', label: 'Focaccia' }] },
    );
    expect(await names(id)).toEqual(['Focaccia']);
    const [row] = await db.admin<{ parent: string }>(
      `select p.slug as parent from public.categories c join public.categories p on p.id = c.parent_id where c.slug = 'focaccia'`,
    );
    expect(row!.parent).toBe('baking');
  });

  it('reject junk, other kinds, and too many', async () => {
    await expectDbError(
      db.createPost(ana.id, {}, { custom: [{ kind: 'cuisine', label: 'x' }] }),
      /2–30 characters/,
    );
    await expectDbError(
      db.createPost(ana.id, {}, { custom: [{ kind: 'primary', label: 'Grilling' }] }),
      /must be cuisines/,
    );
    const many = Array.from({ length: 7 }, (_, i) => ({ kind: 'cuisine', label: `Label ${i}x` }));
    await expectDbError(db.createPost(ana.id, {}, { custom: many }), /at most 6/);
  });

  it('cannot be inserted into categories directly', async () => {
    await expectDbError(
      db.query(ana.id, `insert into public.categories (kind, slug, name) values ('cuisine', 'hack', 'Hack')`),
      /permission denied/,
    );
  });
});

describe('usage', () => {
  it('counts how often each classification is used', async () => {
    const rows = await db.query<{ category_id: string; uses: number }>(
      ben.id,
      `select * from public.classification_usage('cuisine')`,
    );
    const uyghur = await db.admin<{ id: string }>(`select id from public.categories where slug = 'uyghur'`);
    expect(Number(rows.find((r) => r.category_id === uyghur[0]!.id)!.uses)).toBe(2);
  });
});
